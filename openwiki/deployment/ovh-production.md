---
type: "Reference"
title: "OVH Production (canonical since 2026-07-25)"
openwiki_generated: true
---

# OVH Production (canonical since 2026-07-25)

Production moved from the Mac Mini to the OVH VPS so the PWA survives the
Mini sleeping. `deployment/tailscale-and-pwa.md` describes the old Mini
setup and is retained for rollback only.

## Canonical URL

```
https://ovh-vps.taila1553c.ts.net:8446
```

Tailnet-only (Tailscale Serve). Re-add the PWA on the phone from this URL. If the phone still shows an older shell after deploy, open this URL in the browser once and hard-refresh before trusting the installed PWA.

## Topology

| Piece | Where | How |
|---|---|---|
| Next.js prod server :3000 | ovh-vps | systemd `activity-dashboard` (`ops/ovh/activity-dashboard.service`) |
| Tailscale Serve HTTPS :8446 → :3000 | ovh-vps | `tailscale serve --bg --https=8446 http://127.0.0.1:3000` |
| Postgres `activity_log` :5433 (loopback) | ovh-vps | compose `ops/ovh/compose.activity-log-db.yaml`, volume `activity-log-data` |
| electric-circuits ds/engine/api | ovh-vps | `electric-circuits/docker/compose.yaml` + `compose.activity-feed.yaml` + `ops/ovh/compose.ovh-ports.yaml` (loopback-only ports: 7011 engine, 8791 ds, 8795 api) |
| PG tailnet access :5433 | ovh-vps | `tailscale serve --bg --tcp=5433 tcp://127.0.0.1:5433` (tailnet only) |
| Feeders (file/pi/claude/vault/git) | Mac Mini | launchd, `ACTIVITY_DB_URL=postgres://…@ovh-vps.taila1553c.ts.net:5433/activity_log`; shell hooks use `docker run postgres:16 psql` against `100.101.106.60:5433`. They pause when the Mini sleeps — accepted. |

Production source lives at `/home/ubuntu/activity-feed` on the VPS. The running
dashboard is selected through `/home/ubuntu/activity-dashboard/current`;
versioned candidates live under `/home/ubuntu/activity-dashboard/releases`.
Node 22 + pnpm 10.15.1 are installed on the VPS host.

## Security

- Everything binds loopback on the VPS; only Tailscale Serve (HTTPS 8446,
  TCP 5433) exposes anything, and only to the tailnet. Nothing on the
  public NIC except SSH. Docker published ports were deliberately rebound
  to 127.0.0.1 (`ops/ovh/compose.ovh-ports.yaml`) because Docker bypasses ufw.

## Operations

```bash
ssh ovhvps

# dashboard
sudo systemctl status activity-dashboard
sudo journalctl -u activity-dashboard -n 50

# electric stack
cd ~/activity-feed/electric-circuits/docker
sudo docker compose -f compose.yaml -f compose.activity-feed.yaml \
  -f ~/activity-feed/ops/ovh/compose.ovh-ports.yaml ps
curl -s http://127.0.0.1:7011/v1/health   # {"status":"active"}

# postgres
sudo docker exec activity-log-db pg_isready -U activity -d activity_log
```

Deploying new dashboard code (from the Mini / any agent):

**Preferred:** from `dashboard/`, run `npm run deploy:ovh` (stages and builds a
versioned release before atomic activation). Agents making phone-visible changes must do this before
claiming the work is live — see `dashboard/AGENTS.md`.

```bash
cd ~/activity-feed/dashboard && npm run deploy:ovh

# list the current target and built rollback releases
npm run rollback:ovh

# restore an earlier built release
npm run rollback:ovh -- <release-id>
```

Never run `rsync --delete` against the live directory. Failed uploads/builds
leave `current` untouched; failed post-activation health checks restore its
previous target automatically.

After a phone-visible deploy, verify the fresh shell — not just the backend:

1. open the canonical URL in the browser
2. hard-refresh once
3. if the installed PWA still looks stale, remove/re-add it

## Visual editing workflow

The dashboard supports [react-rewrite](https://github.com/donghaxkim/react-rewrite),
a visual editor that overlays the local dev server. The workflow is:

1. **Edit locally:** `npm run dev` + `npx react-rewrite <port>` → make visual
   changes in the browser overlay → Confirm to write to source files.
2. **Deploy to OVH:** run the rsync deploy command above.

This ensures all styling changes are tracked in git and deployed atomically.
See `openwiki/web-ui/pages-and-components.md` for full react-rewrite usage.

## After a schema migration (new tables), add them to
`ELECTRIC_CIRCUITS_PG_TABLES` in `compose.activity-feed.yaml`, rsync, and
`docker compose … up -d --force-recreate engine` on the VPS.


## Channel @mentions (agents)

Channel `@pi` / `@claude` / `@codex` replies run **directly via the `pi` CLI on
the VPS** (no Paseo). Provider/model comes from `piInvocationForHandle` in
`dashboard/src/lib/mentions.ts` (default: Command Code `deepseek/deepseek-v4-pro`).
Tools are disabled (`--no-tools`) for normal chat replies. An issue in
`in_progress` or coding task in `running` with a registered repository gets
the approved coding toolset in an isolated Git worktree.

**Spawn rule:** the dashboard must call `pi` via
`dashboard/src/lib/execFileNoStdin.ts` (`stdio` stdin = `ignore`), **not**
Node `execFile`. Piped stdin makes `pi -p` hang until the 620s timeout
(`SIGTERM`, empty stdout/stderr). See
`dashboard/docs/decisions/ADR-006-pi-channel-stdin.md`.

One-time VPS setup:

```bash
# pi CLI
npm install --prefix ~/.local @earendil-works/pi-coding-agent
printf '%s
' '#!/usr/bin/env bash' \
  'exec node "$HOME/.local/node_modules/@earendil-works/pi-coding-agent/dist/cli.js" "$@"' \
  > ~/.local/bin/pi && chmod +x ~/.local/bin/pi

# Command Code provider + OAuth tokens (copy auth.json from the Mini)
pi install npm:pi-commandcode-provider
# scp Mini:~/.pi/agent/auth.json → VPS:~/.pi/agent/auth.json

sudo systemctl restart activity-dashboard
```

`CHANNEL_AGENT_CWD` / `CHANNEL_PI_BIN` are set in
`ops/ovh/activity-dashboard.service`. Missing cwd on Linux previously caused
`spawn … ENOENT` even when `pi` existed.

Readiness check:

```bash
~/activity-feed/dashboard/scripts/pi-execution-doctor.sh --smoke \
  --worktree-smoke /home/ubuntu/activity-feed
```


## Rollback (window: keep through ~2026-08-01)

The Mini stack is stopped but intact: launchd plist
`com.bencharney.activityfeed.dashboard` (disabled), local containers +
`activity-log-data` volume still present. To roll back: re-enable the
launchd job, rebind Mini Serve 8446, repoint feeders' `ACTIVITY_DB_URL`
back to localhost, and dump/restore OVH → Mini to recover rows written
since cutover.
