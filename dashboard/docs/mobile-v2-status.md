# Mobile-v2 Status

## Real pages
- `/mobile-v2` — Today
- `/mobile-v2/inbox` — Inbox
- `/mobile-v2/inbox/[channelId]` — channel workspace
- `/mobile-v2/inbox/[channelId]/[threadId]` — thread detail
- `/mobile-v2/projects` — Tududi planning + repos
- `/mobile-v2/projects/tududi/[projectUid]` — Tududi project detail
- `/mobile-v2/projects/tududi/[projectUid]/[taskUid]` — Tududi task detail
- `/mobile-v2/projects/[repoId]` — repo detail
- `/mobile-v2/ops` — ops hub

## Real pages (just built)
- `/mobile-v2/fleet` — 3 host cards, metrics, actions, pool-run, 15s auto-refresh
- `/mobile-v2/runs` — Metrics + Runs tabs, overview stats, per-source bars, expandable run rows, pagination
- `/mobile-v2/registry` — search, kind pills, compact record list, inline detail expansion
- `/mobile-v2/config` — mobile-v2 tab shell for Models, Workflows, Notifications, and Perf

## Stub pages
No stub pages remain in the mobile-v2 primary nav.

## Production fallback still used
- some deep actions still link to `/channels/**`, `/projects/**`, `/ops/**`, or `/runs/**`
- the stub pages above intentionally open the existing production routes

## Local Tailscale testing
Use the dev server over Tailscale instead of OVH deploy.

### Command
```bash
cd /Users/bencharney/activity-feed/dashboard
npm run dev:tailscale
```

### URL pattern
- `http://<tailscale-ip>:3011/mobile-v2`

Example on this Mac at the time of writing:
- `http://100.71.118.10:3011/mobile-v2`

## Notes
- `mobile-v2` stays isolated from current production routes
- no OVH deployment is required for phone testing
