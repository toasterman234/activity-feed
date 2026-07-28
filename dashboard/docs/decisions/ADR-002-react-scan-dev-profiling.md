# ADR-002: React Scan for development render profiling

## Status

Accepted

## Date

2026-07-25

## Context

After pruning file-watcher noise and bounding the Electric activity shape,
the remaining lag risk on Activity / Projects / Memory is **client-side
recompute**: every live delta updates the `rows` collection, which invalidates
a chain of `useMemo` pipelines (`enriched` → `filtered` → `bursts` /
`projGroups` / `memSessions`).

We need a low-friction way to **see** which components re-render under real
traffic before committing to larger fixes (debounce/batching, TanStack DB
incremental queries, React Compiler).

Candidates considered:

| Option | Role | Fit now |
|---|---|---|
| [React Scan](https://github.com/aidenybai/react-scan) | Visual render profiler | High — diagnose first |
| TanStack Pacer | Debounce / batch UI updates | Medium — after evidence |
| TanStack DB live queries | Incremental query maintenance | High long-term, larger refactor |
| React Compiler | Auto-memoization | Lower priority — won't shrink snapshots |

## Decision

Install **React Scan** as a **development-only** tool:

1. `react-scan` is a **devDependency**.
2. A tiny client component (`src/app/react-scan.tsx`) calls `scan()` only when
   `NODE_ENV === "development"`.
3. That component is mounted from the root layout so every dashboard surface
   (Activity, Finance, Channels, Models) is covered.
4. It must **never** run in production builds (no
   `dangerouslyForceRunInProduction`, no production import path).

## Consequences

### Positive

- Zero-config visual overlay of re-rendering components while interacting.
- Confirms or falsifies the memo-chain hypothesis before we refactor.
- Easy to remove or toggle once profiling is done.

### Negative / tradeoffs

- Adds measurement overhead while the toolbar is open in dev.
- Does not measure Electric snapshot size, JSON parse cost, or Postgres —
  those remain separate (cutoff API / shape filters / feeders).
- Toolbar UI is present on every local page load until we turn it off.

## How to use

```bash
cd activity-feed/dashboard
npm run dev
# open http://127.0.0.1:3000/ (or Tailscale URL)
# interact with Activity / Collections; watch overlays for hot components
```

To disable without uninstalling: set `enabled: false` in
`src/app/react-scan.tsx`, or temporarily remove `<ReactScan />` from
`layout.tsx`.

## Follow-ups (not in this ADR)

1. If Scan shows Activity-tab churn on every agent delta → add batching
   (TanStack Pacer or a 250–500ms flush).
2. If filters/counts dominate → migrate those `useMemo`s to TanStack
   `useLiveQuery` incrementally.
3. React Compiler only after (1)/(2) evidence.

## References

- https://github.com/aidenybai/react-scan
- https://react-scan.com
- ADR-001 (shape stream lifecycle) — connection-pool freezes are a different class of lag

## Ops note (Connecting hang, 2026-07-25)

The dashboard launch agent runs **`npm run start` (production)**, not `next dev`.
Source edits to `api/activity-log-cutoff` and `page.tsx` do **not** take effect
until `npm run build` + `launchctl kickstart -k gui/$UID/com.bencharney.activityfeed.dashboard`.

Connecting hang root cause that day: production still served a 7-day agent
shape (~9MB) while the engine was also holding ~126 stale shapes. Fix: 1-day
window, exclude `claude.tool.use` from the agent branch, lazy-load Collections
shapes, rebuild + restart.
