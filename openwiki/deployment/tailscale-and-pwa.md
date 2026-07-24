---
type: Deployment
title: Tailscale and PWA Deployment
description: Tailscale serve configuration, PWA setup, production build, and mobile access patterns for the Activity Feed Dashboard.
tags: [deployment, tailscale, pwa, production, mobile]
---

# Tailscale and PWA Deployment

The dashboard runs as a production Next.js server, exposed to mobile devices over Tailscale with HTTPS, and installable as a PWA.

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

## Tailscale Serve

```bash
# Bind Next.js to all interfaces
HOSTNAME=0.0.0.0 npm start

# Expose via Tailscale serve (HTTPS)
tailscale serve --bg --https=8446 http://127.0.0.1:3000
```

The dashboard is then accessible at:
```
https://bens-mac-mini.taila1553c.ts.net:8446
```

**Phone requirement:** Tailscale client installed and connected to the same tailnet.

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

**"Connecting to electric-circuits" forever on phone:**
1. Verify you're running production mode (`npm start`, not `npm run dev`)
2. Verify Tailscale is connected on the phone
3. Force-reload the page (Safari: pull down, or use `?v=N` query param)
4. If installed as home-screen PWA: delete the icon and re-add

**Port conflicts:**
- `:8790` is used by Bun MCP server — the API container is mapped to `:8795` instead
- `:3000` must bind to `0.0.0.0`, not `::1` (loopback-only won't reach Tailscale)
