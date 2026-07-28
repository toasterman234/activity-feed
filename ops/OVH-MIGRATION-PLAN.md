# Activity Feed → OVH Migration Plan

**Status:** EXECUTED 2026-07-25 — live runbook: `openwiki/deployment/ovh-production.md`  
**Target host:** `ovh-vps` (`100.101.106.60`) via SSH `ovhvps` (ubuntu, `~/.ssh/ovh_vps`)  
**Constraint you set:** OK if Mac feeders die when the Mini sleeps/offline  
**Goal:** PWA + data plane stay up on OVH even when the Mini is dead

---

## Access (verified 2026-07-25)

| Capability | Status |
|---|---|
| Tailscale reach `ovh-vps` | Yes — online, ~35ms from Mini |
| SSH `ovhvps` (BatchMode) | Yes — `ubuntu@vps-1e013b68` |
| Node / npm on VPS | Yes (Node 22 installed during Phase 1) |
| Tailscale on VPS | Yes |
| Docker on VPS | Installed during Phase 1 (29.6.2 + Compose v5.3.1) |
| Disk / RAM | 97G (~95G free), 11Gi RAM / 6 vCPU — enough |
| OVH console / billing / DNS | Not needed — Tailscale-only |

---

## Target architecture (Hybrid A) — now live

```
┌──────────────────────────── OVH (always on) ────────────────────────────┐
│  Postgres activity_log (127.0.0.1:5433; tailnet via serve --tcp=5433)   │
│  Electric: engine :7011 · ds :8791 · api :8795 (all loopback-only)      │
│  Next PWA (production) :3000 — systemd activity-dashboard               │
│  Tailscale Serve HTTPS :8446 → :3000  (canonical URL)                   │
└─────────────────────────────────────────────────────────────────────────┘
         ▲ writes when Mini awake                    ▲ reads (shapes)
┌────────┴──────── Mac Mini (optional) ─────────────┴────────────────────┐
│  Feeders (file/pi/claude/vault/git) → OVH PG over Tailscale             │
│  Old local Next + Serve 8446: stopped (rollback until ~2026-08-01)      │
└─────────────────────────────────────────────────────────────────────────┘
```

Canonical URL: `https://ovh-vps.taila1553c.ts.net:8446`

**Accepted tradeoff:** when Mini sleeps, no new feeder events; historical + channels still serve from OVH.

---

## Execution record

### Phase 0 — Freeze & inventory ✅
- Dump size ~13MB; VPS ports free (only Cronicle :3012); passwordless sudo; Serve hostname `ovh-vps.taila1553c.ts.net`.

### Phase 1 — Bootstrap OVH ✅
- Docker 29.6.2 + Compose v5.3.1 via get.docker.com.
- Rsync'd `electric-circuits`, `dashboard`, `feeders`, `openwiki`, `ops` (no node_modules/.next) to `/home/ubuntu/activity-feed`.
- Node 22 (NodeSource) + pnpm 10.15.1; `pnpm install` in electric-circuits reproduced the exact `.pnpm` paths the dashboard's `file:` deps need.
- Postgres via `ops/ovh/compose.activity-log-db.yaml` (loopback-bound, wal_level=logical, volume `activity-log-data`, network `activity-feed-net`).
- Electric images built from source on x86_64 (Mini images are arm64 — not transferable). Started with `compose.yaml` + `compose.activity-feed.yaml` + `ops/ovh/compose.ovh-ports.yaml` (loopback rebind — Docker bypasses ufw on a public VPS).
- Next built and running under systemd `activity-dashboard` (`ops/ovh/activity-dashboard.service`).
- `tailscale serve --bg --https=8446 http://127.0.0.1:3000`.

### Phase 2 — Data migrate ✅
- `pg_dump --no-owner | gzip | ssh | psql` — zero errors; 18k+ activity rows, `electric_circuits_pub` publication included.
- Engine health `{"status":"active"}`; `/v1/shape?table=activity_log` streams data.
- End-to-end through the origin: `/api/shapes.create` 200, `/ds/` responds, `/api/perf/summary` returns restored data.

### Phase 3 — Feeder retarget ✅
- 5 JS watchers (file/pi/pi-session/claude-transcript/vault-channel): `ACTIVITY_DB_URL` added to their launchd plists → `ovh-vps.taila1553c.ts.net:5433`; all restarted and verified running with the env (filewatcher needed `launchctl enable` — label was disabled).
- 2 shell hooks (`claude-hook.sh`, `git-post-commit.sh`): switched from `docker exec activity-log-db` to `docker run --rm postgres:16 psql` against `100.101.106.60:5433` (no native psql on the Mac; tailnet IP because MagicDNS doesn't resolve in-container).
- PG exposed tailnet-only via `tailscale serve --bg --tcp=5433 tcp://127.0.0.1:5433`.
- Verified: live claude.tool.use rows landing in OVH PG during the migration itself.

### Phase 4 — Cutover ✅
- Docs: `openwiki/deployment/ovh-production.md` (canonical), plan marked executed.
- Mini: launchd dashboard stopped + disabled; Mini Serve :8446 turned off. Local PG/electric containers left running but stale (rollback window ~2026-08-01).
- Phone PWA: re-add from the new URL (one-time manual step).

### Phase 5 — Harden (partial)
1. Automated `pg_dump` cron on OVH → off-box copy — **done** (daily, 14-day retention on VPS)
2. ufw baseline (SSH only on public NIC) — ports already loopback-bound; ufw hardening still optional
3. ADR: "production host = OVH" — **done** (`dashboard/docs/decisions/ADR-005-production-host-ovh.md` + vault ADR-2026-07-25)
4. Delete Mini rollback volumes after confidence window (~2026-08-01)

---

## Rollback

Re-enable `com.bencharney.activityfeed.dashboard` on the Mini, rebind Mini
Serve 8446, remove `ACTIVITY_DB_URL` from the feeder plists, restore the
shell hooks' `docker exec`, and dump/restore OVH → Mini to recover rows
written since cutover.
