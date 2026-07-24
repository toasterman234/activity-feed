---
type: Quickstart
title: Activity Feed Dashboard
description: Real-time PWA dashboard with electric-circuits live sync from Postgres, portfolio finance widgets, and Market Lake API integration. Serves as both an activity monitor and a finance/quant mobile app accessible via Tailscale.
tags: [nextjs, electric-circuits, pwa, tailscale, finance, portfolio, real-time]
---

# Activity Feed Dashboard

A Next.js 16 PWA (Progressive Web App) that streams live activity logs and portfolio data from Postgres via electric-circuits — a Rust/DBSP engine that incrementally maintains live query results. Finance data is synced from Life OS DuckDB into Postgres, then streamed to the browser. Quote and screener data comes from the Market Lake API. The app is served over Tailscale for secure mobile access.

## Setup

- Node.js 22+ and npm
- Running electric-circuits stack (engine at `:7011`, API at `:8795`, durable-streams at `:8794`)
- Postgres with `activity_log` and 6 portfolio finance tables (created by ingestion script)
- Market Lake API at `:9077` (local) or via Tailscale Funnel

```bash
cd dashboard
npm install
npm run dev        # development
npm run build && npm start  # production (no HMR, works on mobile)
```

The production server listens at `http://0.0.0.0:3000` and is exposed via `tailscale serve --https=8446 http://127.0.0.1:3000`.

## What's Inside

- **Activity feed** (`/`) — live streaming activity log from file-watcher, pi-watcher, and git hooks feeding into Postgres → electric-circuits
- **Portfolio dashboard** (`/portfolio`) — net worth, asset allocation bar, positions table with live sync
- **Live watchlist** (`/watchlist`) — add/remove stock symbols, real-time quotes from Market Lake API
- **Trade history** (`/trades`) — 5,400+ trades including options, paginated with subset queries
- **Research browser** (`/research`) — quant research strategies and findings from Market Lake
- **VRP screener** (`/screener`) — volatility risk premium scan with IV rank filter

## How Data Flows

```
Life OS DuckDB ──export──▶ Postgres ◀── electric-circuits engine (Rust/DBSP)
Market Lake API                         │
  (:9077) ──direct fetch──▶             │
                                 Next.js PWA (:3000)
                              (@electric-circuits/client)
                                     │
                              Tailscale serve (:8446)
                                     │
                                 Mobile phone
```

For the full lifecycle, see the [architecture overview](/openwiki/architecture/overview.md).

## Key Sections

- [Architecture](/openwiki/architecture/overview.md) — electric-circuits sync, data flow, Next.js rewrites, Tailscale routing
- [Data Pipeline](/openwiki/data-pipeline/ingestion.md) — DuckDB → Postgres sync, Postgres schema, electric-circuits table replication
- [Web UI](/openwiki/web-ui/pages-and-components.md) — page routes, electric-circuits shapes, Market Lake API client
- [Deployment](/openwiki/deployment/tailscale-and-pwa.md) — Tailscale serve, PWA manifest, production build, mobile access
