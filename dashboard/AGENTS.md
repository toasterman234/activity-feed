<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent rules — activity dashboard PWA

## Live sync / HTTP connections (read this before "fixing lag")

**Symptom trap:** UI feels extremely laggy on Channels (or after visiting Activity), and Next's bottom-left pill stuck on **"Rendering"** / **"Compiling"**.

**That pill is `next dev` only.** It means a compile or a router transition is in progress — not a production PWA chrome bug. If it *sticks*, something is blocking the transition.

**Actual root cause (2026-07-25):** live Electric `client.shape(...)` streams were cached at module scope and **never closed**. Over Tailscale/phone the app speaks **HTTP/1.1** (~**6 connections per origin**). Activity opens ~3 long-polls; Channels opens ~3 more → pool full → freezes. The browser / Electric client warns about this explicitly.

**Fix (do not regress):** all shapes go through [`src/app/shape-registry.ts`](src/app/shape-registry.ts):

- `acquireShape(key, factory)` when a page mounts
- `releaseShape(key)` (or `{ immediate: true }` for Activity's heavy shapes) on unmount
- That calls `mat.close()` when the refcount hits 0

Full write-up: [`docs/decisions/ADR-001-shape-stream-lifecycle.md`](docs/decisions/ADR-001-shape-stream-lifecycle.md).

### Do NOT

- Add `let fooCache: Promise<ShapeMaterialization> | null = null` + `client.shape(...)` without registry acquire/release
- "Fix" Channels lag by only switching Turbopack/webpack, virtualizing lists, or toggling `prefetch` — those help other things but **do not** free long-poll sockets
- Assume the Next "Rendering" pill means the app needs a faster bundler; check open `/ds/shape/...` long-polls and connection count first

### Do

- Pair every `acquireShape` / `getXShape()` with a matching `releaseShape` / `releaseXShape()` in the same `useEffect` cleanup
- Prefer `{ immediate: true }` when releasing Activity / other multi-shape sections so the next page can open streams
- Check **Settings → Performance** (`/settings/perf`) before guessing at slowness — p50/p75/p95 per route for Web Vitals, `route.render`, `longtask`, and instrumented spans (`activity.enrich`, `channels.threadExtras`). Wrap new hot paths with `measure()` from `src/lib/perf.ts`. Background: [ADR-004](docs/decisions/ADR-004-perf-monitoring.md)
- Never make `perf_metrics` a normal (logged) table — `electric_circuits_pub` is `FOR ALL TABLES`, so a logged table turns telemetry into replication churn. `npm run init:perf` enforces this
- Stay within **`SHAPE_BUDGET` (4 live shapes per page)** — `acquireShape` throws in dev when exceeded, and `npm run check:shapes` (part of `npm run build`) fails CI. For secondary/per-detail data, poll `client.query()` instead of opening a stream (see `useThreadExtras` in `src/app/channels/shapes.ts` and [ADR-003](docs/decisions/ADR-003-shape-connection-budget.md))
- If lag returns: reproduce Activity → Channels, count established connections to `:3000`, grep the console for the HTTP/1.1 "~6 concurrent" warning

## Production = OVH (phone PWA) — deploy here, not the Mac

**Canonical phone URL:**

```
https://ovh-vps.taila1553c.ts.net:8446
```

Production runs on the **OVH VPS** (`ovhvps`, Tailscale Serve HTTPS :8446 →
`:3000`). The Mac Mini is **not** the phone frontend anymore ([ADR-005](docs/decisions/ADR-005-production-host-ovh.md)).
Editing files only on the Mini does nothing the phone can see until you deploy.

### Agents: deploy after dashboard changes

When you change anything under `dashboard/` that should show up on the phone
(UI, API routes, schema used by those routes):

1. Edit locally (optional: `npm run dev` on **3010** for a desktop check).
2. Apply any new Postgres DDL on **OVH**, not only locally:
   `ssh ovhvps 'sudo docker exec activity-log-db psql -U activity -d activity_log -c "…"'`
3. Deploy: from `dashboard/`, run **`npm run deploy:ovh`**
   (`scripts/deploy-ovh.sh` → rsync + `npm ci` + `npm run build` + restart
   `activity-dashboard`).
4. Verify: `curl` the new route on the VPS and/or hard-refresh the phone PWA
   (Serwist may cache the old shell).

Graph Continuity rollout note:
- `CHANNEL_GRAPH=1` enables the feature
- `CHANNEL_GRAPH_CHANNELS=meta` scopes it to `#meta`
- empty `CHANNEL_GRAPH_CHANNELS` means **all channels**

**Do not** stop after a local-only edit and tell the user it’s live.
**Do not** start production on the Mini for day-to-day phone use.
**Do not** point the user at `http://100.x:3000` — HTTP/1.1 starves Electric
long-polls ([ADR-001](docs/decisions/ADR-001-shape-stream-lifecycle.md)).

Local ports (Mini, for optional desktop dev only):

| Port | Owner |
| --- | --- |
| **3010** | local `next dev` (`npm run dev`) |
| **3000** | unused for phone; OVH owns production |

Full runbook: [`../openwiki/deployment/ovh-production.md`](../openwiki/deployment/ovh-production.md).

## Channel @mentions / spawning `pi` (read before touching trigger)

**Symptom trap:** Research (or any) channel shows
`Failed to respond: Error: Command failed: …/pi -p --mode text …` after ~10
minutes. Workflow step `@pi responding` goes red. `WORKFLOW` stays Drafted.

**Actual root cause (2026-07-26):** Node `child_process.execFile` leaves
stdin open as a pipe. `pi -p` waits on that forever (empty stdout/stderr).
The route timeout (620s) then `SIGTERM`s the child. The thread UI truncates
the error at 400 chars, so you only see the command prefix — not
`signal=SIGTERM`.

**Fix (do not regress):** spawn `pi` only via
[`src/lib/execFileNoStdin.ts`](src/lib/execFileNoStdin.ts)
(`stdio: ['ignore', 'pipe', 'pipe']`). Channel mentions already do this in
[`src/app/api/channels/trigger/route.ts`](src/app/api/channels/trigger/route.ts).

Full write-up: [`docs/decisions/ADR-006-pi-channel-stdin.md`](docs/decisions/ADR-006-pi-channel-stdin.md).

### Do NOT

- Call `execFile` / `promisify(execFile)` / `execFileAsync` for `pi`
- “Fix” mention hangs by raising the timeout, swapping models, or reinstalling
  Command Code auth — those mask the stdin hang
- Copy older plan text that says “use `execFile` from `trigger/route.ts`”
  for `pi` (that pattern is obsolete and broken)

### Do

- Import and use `execFileNoStdin` for every new server-side `pi -p …` call
- When surfacing spawn failures to the thread, include `signal` / `killed` /
  `stderr` (not only `String(err)`), so the next hang is visible in-channel
- Reproduce with: spawn `pi` under Node with piped stdin (hangs) vs
  `stdio: ['ignore', …]` (succeeds in seconds)


## Related infra notes

- `/ds/*` is proxied by [`src/app/ds/[...path]/route.ts`](src/app/ds/[...path]/route.ts) (not a Next rewrite) so long-polls are not reset by the dev rewrite proxy.
- Serwist (PWA SW) is **disabled in dev** (`next.config.ts`) so Turbopack can run; production builds still use webpack for Serwist.
- Bottom nav uses `prefetch={false}` so Next does not background-load the heavy Activity page.
