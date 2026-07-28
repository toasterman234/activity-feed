# ADR-003: Live-shape connection budget (and polled thread extras)

## Status

Accepted

## Date

2026-07-25

## Context

ADR-001 fixed the original freeze by closing Electric shape streams on unmount
(refcounted `shape-registry.ts`). Hours later the bug came back in a new form:
the thread page (`/channels/[channelId]/[threadId]`) gained three more live
shapes (`thread-plans`, `thread-workflow-steps`, `thread-artifacts`) on top of
the three it shares with the channel page — **6 held long-polls at steady
state**, the entire ~6-connection HTTP/1.1 budget.

Consequences:

- Hitting **back** from a thread starved navigation: the 3 thread-only shapes
  stayed open through the registry's 750ms close grace while Next needed a
  socket for the route transition → stuck **"Rendering"** pill, multi-second
  lag.
- Even sitting on the thread, reply POSTs and API calls queued behind the 6
  long-polls.

The registry's lifecycle was correct; the page simply **exceeded the
connection budget**. Docs alone (AGENTS.md "Do NOT") did not prevent this —
the regression was written by an agent that never read them.

## Decision

1. **Explicit budget.** `SHAPE_BUDGET = 4` in `shape-registry.ts`. No page may
   hold more than 4 live shapes (~6 HTTP/1.1 connections minus headroom for
   Next navigation/RSC and API writes).
2. **Runtime enforcement.** `acquireShape` counts active (refs > 0) entries.
   Exceeding the budget **throws in development** and logs an error in
   production. Pending-close (grace) entries don't count — the budget governs
   steady state per page.
3. **Build-time enforcement.** `scripts/check-shape-budget.mjs` runs as part
   of `npm run build` (`npm run check:shapes`):
   - every `client.shape(` must be inside an `acquireShape` factory;
   - no file may reference more than `SHAPE_BUDGET` distinct shape keys or
     `get*Shape()` getters.
4. **Secondary data is polled, not streamed.** Per-thread plans / workflow
   steps / artifacts now use `useThreadExtras(threadId)`
   (`src/app/channels/shapes.ts`), which polls `client.query()` — a one-shot,
   server-side-filtered subset read holding **no** connection — every 3s while
   the tab is visible, with an immediate `refresh()` after local writes.
   The thread page is back to the same 3 shared shapes as the channel page,
   so channel ↔ thread navigation reuses streams via refcount and back is
   instant.

## Rule of thumb for new features

> Adding a live shape to a page is a **capacity decision**, not just a data
> decision.

- 1–2 primary collections that must update sub-second → live shape via the
  registry, within budget.
- Secondary / per-detail data (status panels, artifacts, metadata) →
  `client.query()` polling or a plain API route.
- Never raise `SHAPE_BUDGET` to make a page fit; restructure the data access
  instead. The real ceiling is the browser's per-origin connection limit.

## Transport (shipped 2026-07-25)

Serving the PWA over **HTTPS (Tailscale Serve) → HTTP/2** is live:

```
https://bens-mac-mini.taila1553c.ts.net:8446
```

launchd `com.bencharney.activityfeed.dashboard` runs production `next start`
and keeps Serve bound on `:8446` (central-repo-ops ADR-0066 amendment). The
budget above stays — HTTP/2 is headroom, not a license to open more streams.
Do **not** day-to-day-use `http://100.x:3000` (HTTP/1.1).

## How to verify

1. `npm run check:shapes` passes.
2. Open a thread, then hit back: the "Rendering" pill (dev-only) must clear
   immediately; `lsof -iTCP:3000 -sTCP:ESTABLISHED` should stay well under 6
   browser connections.
3. On a thread, plan toggles round-trip within one poll tick (≤3s) and
   immediately after `refresh()`.

## See also

- [ADR-001](ADR-001-shape-stream-lifecycle.md) — stream lifecycle / registry
- `src/app/shape-registry.ts` — budget + enforcement
- `src/app/channels/shapes.ts` — `useThreadExtras` polling hook
- `scripts/check-shape-budget.mjs` — build gate
