---
type: Architecture
title: Architecture Overview
description: Electric-circuits sync, data flow, Next.js rewrites, and Tailscale routing for the Activity Feed Dashboard.
tags: [architecture, electric-circuits, nextjs, proxy, tailscale, data-flow]
---

# Architecture Overview

The dashboard uses electric-circuits (a Rust/DBSP engine) for real-time sync and Next.js App Router rewrites to proxy the circuits API and durable-streams through a single origin — eliminating CORS issues for mobile Tailscale access.

## Request Lifecycle

```
Browser/Mobile
    │
    ▼
Tailscale serve (:8446 → :3000)
    │
    ▼
Next.js 16 (production)
    │
    ├── /api/*  ──rewrite──▶  electric-circuits API (:8795, tRPC)
    ├── /ds/*   ──rewrite──▶  electric-circuits durable-streams (:8794)
    └── /v1/shape ──rewrite──▶ electric-circuits engine (:7011)
```

Key source files:

- **Next.js config:** `dashboard/next.config.ts` — three rewrites plus `turbopack.root`
- **Electric shapes:** `dashboard/src/app/electric.ts` — `client.shape()` definitions per table
- **Schema:** `dashboard/src/app/schema.ts` — typed column definitions for all 7 synced tables
- **Market Lake client:** `dashboard/src/lib/market-lake.ts` — typed fetch wrapper for `:9077` endpoints

## Electric-Circuits Sync

The electric-circuits engine runs in Docker (image: `electric-circuits-engine`) and consumes Postgres logical replication from 7 tables:

- `activity_log` — file-watcher, pi-watcher, and git hook events
- `portfolio_positions` — Schwab, Fidelity, on-chain wallet holdings
- `portfolio_trades` — 5,400+ trades including options
- `portfolio_balances` — cash account balances
- `portfolio_net_worth` — daily net worth snapshots
- `portfolio_benchmarks` — SPY and VIX daily closes
- `portfolio_allocation` — asset class weights with drift

The engine maintains DBSP incremental materializations. On each Postgres write, it emits Z-set deltas over `/v1/shape`. The `@electric-circuits/client` and `@electric-sql/client` both speak the same wire protocol, so either can consume the stream.

The extended `@electric-circuits/client` (used by the dashboard) adds:
- **Subset queries** — `subset({ ordering: "date", direction: "desc" })` for paginated trade history
- **Live aggregations** — `aggregate({ count: true, sum: "market_value" })` for portfolio totals

## Same-Origin Proxy Strategy

The dashboard, API, and durable-streams all run on different ports. To avoid CORS errors (which silently break the phone's PWA), Next.js rewrites proxy everything through the dashboard's own origin:

```typescript
// next.config.ts
rewrites: async () => ({
  beforeFiles: [
    { source: "/api/:path*", destination: "http://127.0.0.1:8795/:path*" },
    { source: "/ds/:path*",  destination: "http://127.0.0.1:8794/:path*" },
  ],
})
```

The client constructs all URLs from `window.location.origin` — so on both desktop (`localhost:3000`) and mobile (`bens-mac-mini.taila1553c.ts.net:8446`), requests stay same-origin.

## Tailscale Routing

```
Phone (Tailscale client)
    │
    ▼
tailscale serve --https=8446 http://127.0.0.1:3000
```

Tailscale serve terminates TLS and forwards to the local Next.js production server. The phone accesses a single HTTPS URL — all API and stream traffic flows through the same origin via Next.js rewrites.

## Development vs Production

- **`next dev`** ships HMR client and devtools that open a WebSocket back to the dev server. Over Tailscale (non-localhost), this dev-mode machinery stalls silently — React never hydrates. **Always use `next build && next start` for mobile access.**
- **`next start`** strips all dev-mode code. Serves a clean production bundle that works identically on desktop and mobile.
