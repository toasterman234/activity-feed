# PLAN — Live collapsed agent-activity feed

**Goal:** When you talk to an agent in a channel/thread, show a live, collapsed
strip of what it's *thinking / doing* (reading, calling a tool, drafting), that
expands to the full step-by-step trace. Works on the phone/OVH dashboard.

**Status:** shipped and verified on OVH production (2026-07-26).

## What actually shipped (post-implementation note)

Tasks 1–3 landed largely as designed: `thread_activity_events` table, `pi
--mode json` streaming producer in `runMentionJob`
(`dashboard/src/app/api/channels/trigger/route.ts`), and the read path folded
into the existing `useThreadExtras` poll (`dashboard/src/app/channels/shapes.ts`)
— no new held Electric shape, per ADR-003.

**Task 4 pivoted.** The originally-planned collapsed `<ActivityStrip>` (a
separate box above the reply, polling `thread_activity_events`) was built and
works, but real usage feedback was: *"I don't care about the strip. I want to
see live thinking/action/activity in the thread underneath the strip where I'm
actually talking to the agent."* So the primary live signal is now **inline**:
the `_working…_` placeholder chat message itself is live-overwritten in place
(`updateMessageBody` in `trigger/route.ts`) with a rolling view of the
agent's thinking, tool calls, and "writing reply…", throttled to ~600ms writes.
Because `messages` is a true held Electric shape (not polled), this update
propagates instantly — no poll-interval lag. The separate strip still exists
as a secondary/expandable view; the inline trace is what a user actually sees
by default.

**Root cause of the one real bug hit during rollout:** none in the streaming
code itself. The apparent "stuck on working…" failure on first OVH test was a
verification methodology error (polled only 16s, then deleted the in-flight
test message before the fallback path — a second, slower `pi` invocation —
had time to resolve). Confirmed via a proper local test with a 60s+ observation
window, then re-verified in a real browser via Interceptor before redeploying.

**Deployment prerequisites confirmed required (do these for any environment,
not just OVH):** the `thread_activity_events` table must be created in that
environment's Postgres (schema.ts alone does not create it — it's the Electric
client schema, not DDL), and `CHANNEL_LIVE_ACTIVITY=1` must be set in the
running process's actual environment (verify via `/proc/<pid>/environ` after
restart, not just the unit file on disk).

---

## Grounding — how it actually works today (read first)

- **Transport is already Electric-over-durable-streams.** `src/app/electric.ts`
  creates the `@electric-circuits/client` against `/api` (tRPC, :8795) and
  `/ds` (durable-streams `ds-rust`, :8794), both same-origin via
  `next.config.ts` rewrites (this is what makes phone/Tailscale work — ds-rust
  has no CORS). **Do not** add a raw SSE endpoint; it would break the
  same-origin proxy model.
- **Live-shape budget (ADR-003).** A page may hold ~3 live shapes max (HTTP/1.1
  6-connection limit). The thread page (`src/app/channels/[channelId]/[threadId]/page.tsx`)
  already holds all 3: `channels`, `channel_members`, `messages`.
  Per-thread extras (`thread_plans`, `thread_workflow_steps`, `thread_artifacts`,
  `thread_meta`, `thread_promotions`) are **polled** via `client.query()` in
  `useThreadExtras` (`src/app/channels/shapes.ts`), refreshed every 1200ms, with
  a "burst refresh" while a promote job runs. **We extend this poll — we do NOT
  add a 4th held shape.**
- **The agent job is one blocking subprocess.** `runMentionJob` in
  `src/app/api/channels/trigger/route.ts` runs `pi -p --mode text --no-tools
  --thinking off ...` via `execFileNoStdin` (timeout 620s), fire-and-forget. Its
  only live output is: a `_working…_` placeholder `messages` row + one
  `thread_workflow_steps` row flipped running→done/error. The real reply is
  parsed from stdout JSON and inserted **all at once at the end**. There is no
  fine-grained activity today.
- **`pi` can emit incremental events.** `pi --mode json` and `pi --mode rpc`
  exist (`pi --help`). RPC mode streams line-delimited JSON events (thinking
  deltas, tool calls, tool results, final message). This is our event source.
- **The UI already renders steps.** Thread page lines ~624-648 render
  `extras.steps` (sorted by `created_at`) as a "Workflow" list with status dots
  (`●` running / `✓` done / `✕` error). That component is the template for the
  collapsed activity strip.

**Behavior-change flag:** chat currently runs `--no-tools --thinking off`, so
there is literally nothing to stream. To show real "thinking/doing" the job must
run with thinking on and/or tools on. Keep this **opt-in per lifecycle** (like
the existing `CHANNEL_RESEARCH_TOOLS=1` gate) so live channels don't change
until it's browser-verified.

---

## Design in one line

Add a `thread_activity_events` table → have `runMentionJob` stream `pi --mode
rpc` and upsert one coalesced event row per activity → surface it through the
**existing thread-extras poll** (no new shape) → render a collapsed
`<ActivityStrip>` in the thread page.

---

## Tasks

### Task 1 — DB: `thread_activity_events` table
- New Postgres table (add migration alongside existing schema; the DB lives in
  the `activity-log-db` compose service — see `ops/ovh/compose.activity-log-db.yaml`):
  ```sql
  CREATE TABLE IF NOT EXISTS thread_activity_events (
    id          TEXT PRIMARY KEY,
    thread_id   TEXT NOT NULL,
    run_id      TEXT NOT NULL,          -- one agent invocation
    seq         INTEGER NOT NULL,       -- order within the run
    kind        TEXT NOT NULL,          -- 'thinking' | 'tool' | 'status' | 'error'
    label       TEXT NOT NULL,          -- one-line collapsed summary
    detail      TEXT DEFAULT '',        -- expandable body (tool args/output, thinking text)
    status      TEXT DEFAULT 'running', -- 'running' | 'done' | 'error'
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tae_thread ON thread_activity_events (thread_id, created_at);
  ```
- **Why a new table, not `thread_workflow_steps`:** steps are lifecycle-workflow
  state; activity is the moment-to-moment agent trace. Mixing them pollutes the
  existing "Workflow" box. Keep them separate.
- Register it in `src/app/schema.ts` (columns block, like `thread_workflow_steps`
  at line ~238) so `client.query()` can read it. Do **not** add it to
  `src/app/electric.ts` as a held `*_SHAPE` — it's polled.
- Add a retention/pruning note: activity events are high-volume and disposable.
  Prune rows older than N days (or keep only the last run per thread) — wire into
  the existing disk/cleanup story. Do not let this table grow unbounded.

### Task 2 — Producer: stream `pi --mode rpc` into activity rows
In `src/app/api/channels/trigger/route.ts`, `runMentionJob`:
- Replace the single `execFileNoStdin(... --mode text ...)` call with a
  **spawned** process using `--mode rpc` (keep `execFileNoStdin`'s stdin-ignore
  fix — `pi -p` hangs on an open stdin; spawn with `stdio: ['ignore','pipe','pipe']`).
- Parse stdout as line-delimited JSON. For each event, upsert a
  `thread_activity_events` row (generate `run_id` once per job; increment `seq`):
  - thinking deltas → coalesce into one `kind:'thinking'` row per thinking block
    (update `detail`, don't spam one row per token).
  - tool call start → `kind:'tool'`, `status:'running'`, `label:'calling <tool>'`,
    `detail` = args summary. Tool result → flip same row to `done`, append output
    to `detail`.
  - final message event → this is the reply; parse it the same way the current
    code parses the structured JSON (`message`/`plan`/`nextState`/`artifact`).
- **Confirm the rpc event schema first** by running once by hand:
  `pi -p --mode rpc --thinking low "say hi"` and capturing the JSON lines. Map
  real event names — do not assume. If `rpc` is awkward, fall back to
  `--mode json`. Document the mapping at the top of the parser.
- Keep the existing end-state writes: delete `_working…_` placeholder, insert
  final reply into `messages`, write plan/artifact, transition `nextState`, and
  flip the `thread_workflow_steps` row done/error (unchanged). Activity events
  are **additive** — the existing behavior must survive if streaming fails
  (wrap the stream parse in try/catch; on parse failure fall back to reading
  final stdout as today).
- **Gate it:** only run with thinking/tools on when the lifecycle opts in (new
  env flag e.g. `CHANNEL_LIVE_ACTIVITY=1`, mirroring `CHANNEL_RESEARCH_TOOLS`).
  Off by default → live channels unchanged until verified.

### Task 3 — Read path: fold into existing thread-extras poll
In `src/app/channels/shapes.ts`:
- Add `activity: ActivityEventRow[]` to the `ThreadExtras` interface and to the
  `useThreadExtras` `client.query()` batch (server-filtered by `thread_id`,
  ordered by `created_at`). **No new held shape** — this rides the existing 1200ms
  poll, respecting ADR-003.
- While a run is active (any activity row with `status:'running'` in the last ~30s,
  or the workflow step is `running`), trigger the **burst refresh** the promote
  flow already uses (`setInterval(() => extras.refresh(), 1200)` in the thread
  page) so the strip feels live. Stop bursting when no running rows remain.

### Task 4 — UI: collapsed `<ActivityStrip>`
In the thread page (`src/app/channels/[channelId]/[threadId]/page.tsx`), above or
beside the existing "Workflow" block (~line 624):
- Collapsed default: a single line = the latest activity event's `label`, with a
  pulsing dot while any event is `running` (reuse the `animate-pulse text-amber-500`
  style already in the steps list). Show elapsed time.
- Expandable via `<details>` (same pattern as the "Artifact" block at ~line 650):
  full ordered list of the current run's events — thinking / tool / status — each
  with the status glyph and truncated `detail`.
- Only show for the current/most-recent `run_id`; collapse older runs behind a
  "previous runs" affordance or drop them (retention, Task 1).
- Match existing Tailwind idiom (zinc palette, `text-[10px] uppercase tracking-wide`
  section headers).

### Task 5 — Verify (mandatory, browser)
- Local: run the dashboard, `@mention` an agent in a thread with
  `CHANNEL_LIVE_ACTIVITY=1`, watch the strip populate live (thinking → tool →
  reply), then confirm it collapses and expands. Check the phone/narrow layout.
- Confirm a **failed** run still shows the error path and doesn't wedge the
  burst-refresh loop.
- Confirm live channels with the flag **off** behave exactly as before.
- Deploy to OVH only after local browser verification: `cd dashboard && npm run
  deploy:ovh` (see `dashboard/AGENTS.md` / `openwiki/deployment/ovh-production.md`).
  Note: the agent subprocess runs on whichever host serves `/api/channels/trigger`
  — on OVH that's the OVH box, so `pi` and its providers must be reachable there.

---

## Explicitly out of scope
- No new Electric held shape (ADR-003 budget).
- No raw SSE / `EventSource` endpoint (breaks the same-origin `/ds` proxy that
  makes phone access work).
- No token-level streaming into the DB (coalesce; the table is not a keystroke log).
- Changing the default chat behavior of existing live channels (gated off).

## Open decisions for the implementer
1. `--mode rpc` vs `--mode json` — pick after inspecting real output (Task 2).
2. Retention policy: last-run-only vs time-based prune (Task 1).
3. Whether tool *output* (not just tool name) is safe to surface in the collapsed
   detail, or should stay expand-only for noise/secrets reasons.
