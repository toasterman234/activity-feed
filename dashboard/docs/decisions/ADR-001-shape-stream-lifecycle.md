# ADR-001: Refcounted Electric shape stream lifecycle

## Status

Accepted

## Date

2026-07-25

## Context

This dashboard is a Next.js PWA that syncs live data through Electric Circuits
shapes (`client.shape(...)`). Each shape opens a **long-lived long-poll** to
`/ds/shape/...` (proxied to the durable-streams backend).

Phone / Tailscale access uses **plain HTTP** (not HTTPS). Under HTTP/1.1,
browsers allow roughly **six concurrent connections per origin**. The Electric
client itself logs a warning when this limit is in play:

> Using HTTP (not HTTPS) typically limits browsers to ~6 concurrent connections
> per origin under HTTP/1.1. This can cause slow streams and app freezes…

Pages historically cached shapes in module scope:

```ts
let cache: Promise<ShapeMaterialization> | null = null;
function getShape() {
  if (!cache) cache = client.shape(...);
  return cache;
}
```

and never called `mat.close()` on unmount. Visiting Activity (3 shapes) then
Channels (3 shapes) left **six+ long-polls alive forever**. Navigation then
competed for the same tiny connection pool: the UI froze, and Next.js’s
dev-only bottom-left pill stuck on **“Rendering”** / **“Compiling”**.

### What this was *not*

Several earlier attempts fixed real but **secondary** issues and were mistaken
for the root cause:

| Attempt | Helps? | Why it didn’t fix the freeze |
| --- | --- | --- |
| Turbopack instead of `--webpack` in dev | Dev compile speed | Pill can say “Compiling”, but the freeze was connection starvation |
| Disable Serwist in dev | Lets Turbopack run | Unrelated to live sync |
| List virtualization (`virtua`) on Activity | DOM cost for 16k rows | Helps Activity remount; does not free HTTP connections |
| `prefetch={false}` on bottom nav | Stops background Activity prefetch | Good hygiene; pool still fills after a normal Activity visit |
| Custom `/ds/[...path]` route handler | Stops Next rewrite proxy killing long-polls | Necessary for sync correctness; does not limit *how many* polls stay open |

The pill itself is **dev-only** (`next dev`). Production (`next start`) does not
show it. A stuck “Rendering” pill in dev is a symptom that a client navigation
is blocked — here, blocked waiting on saturated HTTP/1.1 sockets.

## Decision

1. **All live shapes go through** [`src/app/shape-registry.ts`](../../src/app/shape-registry.ts):
   - `acquireShape(key, factory)` on mount
   - `releaseShape(key)` on unmount (refcount → 0 → `mat.close()`)
2. **Heavy Activity shapes** (`activity-log`, `collections`, `judgments`) release
   with `{ immediate: true }` so connections free before Channels/Finance open
   theirs.
3. **Other shapes** use a short grace period (~750ms) so SPA navigations that
   unmount then remount the same shape (e.g. channel → thread) do not thrash
   close/reopen.
4. **Never** add a new `let xyzCache = client.shape(...)` that outlives the
   page without going through the registry.

## Alternatives considered

### Keep shapes open forever (status quo)

- Pros: Instant return to Activity (no resync)
- Cons: Guaranteed freeze after visiting two multi-shape sections over HTTP/1.1
- Rejected: Breaks Channels / Finance after any Activity visit

### HTTPS / HTTP/2 only

- Pros: Raises connection limits; Electric’s recommended path
- Cons: Not how Tailscale phone access is set up today; still leaks streams
- Deferred: Worth doing later; does not replace correct lifecycle

### Single global “sync provider” in the root layout

- Pros: One place to own subscriptions
- Cons: Larger refactor; still needs pause/close when sections are unused
- Rejected for now: Refcounted per-page acquire/release is enough

## Consequences

- Leaving Activity **closes** its streams; returning to Activity resyncs
  (bounded by the activity-log cutoff API). That cost is acceptable vs freezes.
- Channel list → detail → thread can share shapes via refcount + grace period.
- Agents debugging “slow Channels” / stuck Next pill must check **connection
  count and open shapes first**, not assume webpack/Turbopack or list rendering.
- New pages that call `client.shape` must use the registry or they will
  reintroduce the bug.

## How to verify

1. Open Activity, wait until the feed loads.
2. Navigate to a channel detail page.
3. Within a few seconds, Brave/Chrome should hold **well under 6** established
   connections to `:3000`, and the console should **not** spam the HTTP/1.1
   freeze warning.
4. Dev log should show only the shapes for the current section polling, not
   Activity + Channels simultaneously after leave.

## See also

- [ADR-003](ADR-003-shape-connection-budget.md) — per-page live-shape budget + polled thread extras (follow-up regression fix)

- Agent rules: [`AGENTS.md`](../../AGENTS.md) (section “Live sync / HTTP connections”)
- Implementation: [`src/app/shape-registry.ts`](../../src/app/shape-registry.ts)
- Electric client note on `close()`: `electric-circuits/packages/client/src/index.ts`
