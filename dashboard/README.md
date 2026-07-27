# Activity Feed Dashboard

Next.js 16 PWA for Ben's activity dashboard on OVH. The app is mobile-first and serves as a one-screen control panel for work, threads, approvals, and system status, with deeper detail behind the main tabs.

**Production URL:** `https://ovh-vps.taila1553c.ts.net:8446`

## What the app shows

- **Home** — compact overview: unread, needs-me, active work, hot threads, agent/system pulse
- **Activity** — raw activity feed and memory/projects/collections tabs
- **Channels** — channel list, thread list, thread detail, lifecycle/state controls, Graph Continuity row, and hidden continuity feed
- **Channels Inbox** — decisions, proposals, and memory candidates waiting for review
- **Finance** — portfolio, banking, watchlist, trades, screener, personal views
- **Models** — model/proxy status, swaps, subscription usage
- **Settings** — perf diagnostics and operational settings

## Production topology

- Next.js production server runs on the **OVH VPS** at `127.0.0.1:3000`
- Tailscale Serve exposes it at **HTTPS 8446**
- Postgres + electric-circuits also run on OVH
- Feeders still run on the Mac Mini and write into OVH Postgres

See `openwiki/deployment/ovh-production.md` for the full runbook. Graph Continuity is live on OVH and enabled across channels; use `#meta` as the proving ground for future behavior changes before widening new experiments.

## Local development

```bash
npm run dev
```

The dev server picks the next available port. Open the URL it prints.

## Visual editing

`react-rewrite` can edit the local dev server visually:

```bash
# 1. Start the dev server
npm run dev

# 2. In another terminal, launch react-rewrite
npx react-rewrite <port>
```

Changes are staged until you click **Confirm**. `Cmd+Shift+L` shows the changelog.

## Deploy to OVH

Preferred:

```bash
npm run deploy:ovh
```

Equivalent manual flow:

```bash
rsync -az --delete --exclude node_modules --exclude .next --exclude .git \
  ~/activity-feed/dashboard/ ovhvps:~/activity-feed/dashboard/
ssh ovhvps 'cd ~/activity-feed/dashboard && npm ci && npm run build && sudo systemctl restart activity-dashboard'
```

## PWA cache gotcha

If the phone still shows an old shell after deploy:

1. Open the production URL in the browser, not the installed icon
2. Hard refresh once
3. If still stale, close/remove the installed PWA and re-add it

The service worker can keep an older shell until the client reloads.
