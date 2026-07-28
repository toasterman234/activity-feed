# ADR-004: Continuous performance measurement (Web Vitals + custom spans)

## Status

Accepted — 2026-07-25

## Context

ADR-002 added React Scan, which answers "which component is re-rendering right
now" in a dev session. It cannot answer the questions that actually come up:

- Did the channel page get slower than it was last week?
- Is the Activity page slow for everyone, or only on the phone?
- When the UI froze, how long did the main thread actually block?

React Scan is dev-only and leaves no record. The lag work behind ADR-001 and
ADR-003 was diagnosed by hand each time, from memory of how the app "used to
feel". We wanted numbers that persist across sessions.

The constraint that shapes every choice below: **this app is a live-sync app
whose known failure mode is too much traffic**. Telemetry that adds insert churn
or HTTP connections would degrade the thing it measures.

## Decision

Collect two kinds of samples into one table, and read them back through plain
polled API routes.

### 1. Sources

| Source | What it captures | Where |
| --- | --- | --- |
| `useReportWebVitals` (ships with Next) | LCP, INP, CLS, FCP, TTFB per load and per client navigation | `src/app/perf-monitors.tsx` |
| `route.render` | pathname commit → first paint after it | `src/app/perf-monitors.tsx` |
| `longtask` PerformanceObserver | main-thread blocks ≥ 200ms | `src/app/perf-monitors.tsx` |
| `measure()` / `startMeasure()` | explicit spans around known-expensive work | `src/lib/perf.ts` |

No new dependency: `next/web-vitals` is part of Next, and the rest is
`PerformanceObserver` plus `performance.now()`.

Spans are also recorded as real `performance.mark`/`measure` entries, so they
appear in the browser Performance panel alongside React Scan's render data.

Currently instrumented spans:

- `activity.enrich` / `activity.filter` — the memo chain in `src/app/page.tsx`
  that maps and sorts every synced row on each delta
- `channels.threadExtras` — the `client.query()` poll that ADR-003 substituted
  for three live shapes

### 2. Sink: an UNLOGGED table

`perf_metrics` is `CREATE UNLOGGED TABLE` (`scripts/init-perf-metrics.mjs`,
`npm run init:perf`). This is load-bearing, not a micro-optimization:

`electric_circuits_pub` is `FOR ALL TABLES`. A normal table would put every perf
row into the WAL, through logical replication, into the Electric engine, and out
to browsers as deltas — the exact insert churn that made the app lag in the
first place. Postgres excludes unlogged tables from `FOR ALL TABLES`
publications, so this data never enters the replication path. `init:perf`
asserts the table is absent from `pg_publication_tables` and fails if it isn't.

The tradeoff is that rows are lost if Postgres restarts uncleanly. That is
acceptable for telemetry, and rows are pruned after 14 days anyway.

### 3. Transport: batched, beacon on hide

`src/lib/perf.ts` queues entries and flushes every 10s, at 40 entries, or on
`visibilitychange`/`pagehide` via `navigator.sendBeacon`. Per-metric POSTs would
compete with Electric's long-poll connections for the ~6-per-origin HTTP/1.1
budget (ADR-003).

### 4. Read path: polled routes, not shapes

`/api/perf/summary` aggregates percentiles in Postgres; Ops → Config → Perf polls it every
30s. Deliberately **not** an Electric shape — a live shape here would consume
one of the 4 per-page connections that ADR-003 rations, to display data that
changes slowly and matters in aggregate.

## Consequences

### Positive

- Regressions are visible after the fact, per route, with p50/p75/p95.
- `longtask` records how long the main thread actually blocked, which is what
  "the UI froze" means in measurable terms.
- Zero replication impact, zero new live connections, no new dependency.
- Instrumenting new hot paths is a one-line `measure()` wrap.

### Negative / tradeoffs

- `perf_metrics` survives normal restarts but not a crash.
- `route.render` and the paint-based vitals (LCP, FCP) only record in a
  **visible** tab: a hidden tab never runs `requestAnimationFrame`, and Chrome
  does not paint an occluded window. TTFB and `longtask` still record. This is
  intentional — the effect bails out when `document.visibilityState !==
  "visible"`, because otherwise the deferred callback fires whenever the tab is
  restored and logs time-to-visible as if it were render cost.
- Per-component attribution still requires React Scan in dev. This records
  aggregate cost, not a render tree.
- Sampling is per session, not per entry, so percentiles stay interpretable.

## How to use

```bash
npm run init:perf        # once per database
npm run dev              # browse the app, then open Ops → Config → Perf
```

Performance lives under **Ops → Config → Perf** (`/ops/config?tab=perf`). `/perf` and `/settings/perf` redirect there.

To instrument a new hot path:

```ts
import { measure, startMeasure } from "@/lib/perf";

const result = measure("thing.name", () => expensiveWork(), { rows: n });

const stop = startMeasure("async.thing");
await work();
stop();
```

To stop collection on one device: `localStorage.setItem("perf:off", "1")`.
To disable everywhere: `NEXT_PUBLIC_PERF_DISABLED=1`. To sample a fraction of
sessions: `NEXT_PUBLIC_PERF_SAMPLE=0.25`.

## Follow-ups (not in this ADR)

- Alerting when p95 regresses between deploys.
- A build-time budget check (like `check:shapes`) that fails when a route's p75
  crosses a threshold.
- Server-side timing for `/api/*` and `/ds/*` handlers; this ADR only covers
  the client.

## References

- ADR-001 — shape stream lifecycle
- ADR-002 — React Scan dev profiling
- ADR-003 — shape connection budget
- https://web.dev/articles/vitals
- https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals
