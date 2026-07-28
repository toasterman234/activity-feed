---
type: Deployment
title: Tailscale and PWA Deployment
description: Tailscale serve configuration, PWA setup, production build, and mobile access patterns for the Activity Feed Dashboard.
tags: [deployment, tailscale, pwa, production, mobile]
---

# Tailscale and PWA Deployment

The dashboard runs as a production Next.js server, exposed to mobile devices over Tailscale with HTTPS, and installable as a PWA.

> **SUPERSEDED 2026-07-25.** Production moved to the OVH VPS. The canonical
> URL is now `https://ovh-vps.taila1553c.ts.net:8446` and the authoritative
> runbook is [OVH Production](ovh-production.md). This page describes the old
> Mac Mini setup and is kept for rollback only.

## Canonical URL (historical Mini URL — rollback only)

```
https://bens-mac-mini.taila1553c.ts.net:8446
```

This is **HTTP/2** (verified). It multiplexes Electric long-polls over one
TLS connection, so the browser's ~6-connection HTTP/1.1 cliff does not apply.

**Do not** open `http://100.71.118.10:3000` (or any plain `http://100.x:3000`)
from a phone or laptop for day-to-day use. That path is HTTP/1.1 and will
reintroduce the stuck "Rendering" pill freezes described in
[Live Sync Connection Budget](../architecture/live-sync-connection-budget.md).

Production is kept up by launchd `com.bencharney.activityfeed.dashboard`
(`~/activity-feed/dashboard/scripts/start-production.sh`), which also
idempotently rebinds Tailscale Serve on `:8446`.


## Production Build

```bash
cd dashboard
npm run build   # type-checking disabled for vendored deps
npm start       # starts on 0.0.0.0:3000
```

**Critical:** Always use `next build && next start` for mobile access. `next dev` includes HMR and devtools that stall over Tailscale (non-localhost), causing a silent hydration failure.

**Build config:**
```typescript
// next.config.ts
{
  typescript: { ignoreBuildErrors: true },  // upstream @electric-circuits type mismatch
  turbopack: { root: process.cwd() },       // suppress workspace root warning
  rewrites: async () => ({
    beforeFiles: [
      { source: "/api/:path*", destination: "http://127.0.0.1:8795/:path*" },
      { source: "/ds/:path*",  destination: "http://127.0.0.1:8794/:path*" },
    ],
  }),
}
```

## Tailscale Serve + launchd

Managed by `com.bencharney.activityfeed.dashboard` (see central-repo-ops
ADR-0066 amendment 2026-07-25). Manual equivalent:

```bash
# Production start (binds 0.0.0.0:3000)
~/activity-feed/dashboard/scripts/start-production.sh

# Or just the HTTPS bind (idempotent; start script does this too)
tailscale serve --bg --https=8446 http://127.0.0.1:3000
```

Verify HTTP/2:
```bash
curl -sI --http2 https://bens-mac-mini.taila1553c.ts.net:8446/ | head -1
# expect: HTTP/2 200
```

**Phone requirement:** Tailscale client installed and connected to the same
tailnet. Install / reinstall the PWA from the **HTTPS** URL above — a home-
screen icon saved from the plain HTTP IP will keep hitting HTTP/1.1.

## PWA Configuration

**Manifest:** `public/manifest.json`
```json
{
  "name": "Activity Feed",
  "short_name": "Feed",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": []
}
```

**Installation:** On iOS Safari, tap Share → "Add to Home Screen". On Android Chrome, the install banner appears automatically.

**Important:** If you previously installed the PWA from an older build, the home-screen icon caches aggressively. Delete the icon and re-add it after major updates. Alternatively, always launch from Safari with a fresh URL.

## Dependent Services

All must be running before the dashboard starts:

| Service | Port | Container | Health Check |
|---|---|---|---|
| electric-circuits engine | 7011 | `electric-circuits-engine-1` | `curl :7011/v1/health` |
| electric-circuits API | 8795 | `electric-circuits-api-1` | `curl -X POST :8795/shapes.create` |
| electric-circuits DS | 8794 | `electric-circuits-ds-1` | `curl :8794/` |
| Postgres | 5433 | `activity-log-db` | `pg_isready -h localhost -p 5433` |

**Start order:**
1. Postgres (must be ready before engine)
2. Electric-circuits engine, API, DS
3. Next.js production server
4. Tailscale serve

## Troubleshooting

**"Connecting to electric-circuits" forever on phone / lag / "Rendering" pill:**
1. Confirm the URL is `https://bens-mac-mini.taila1553c.ts.net:8446` (HTTP/2),
   **not** `http://100.x:3000`
2. Confirm launchd is up: `launchctl print gui/$(id -u)/com.bencharney.activityfeed.dashboard | head`
3. Confirm Tailscale is connected on the phone
4. Force-reload (Safari pull-down, or `?v=N`). If the home-screen PWA was
   installed from the plain HTTP IP, delete it and re-add from the HTTPS URL

**Port conflicts:**
- `:8790` is used by Bun MCP server — the API container is mapped to `:8795` instead
- `:3000` must bind to `0.0.0.0`, not `::1` (loopback-only won't reach Tailscale)
