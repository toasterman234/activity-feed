# ADR-005: Production host is the OVH VPS, not the Mac Mini

## Status

Accepted — executed 2026-07-25.

## Context

The dashboard, its Postgres (`activity_log`), the electric-circuits stack
(ds/engine/api), and Tailscale Serve all ran on the Mac Mini. Every time the
Mini slept or hung, the phone PWA and desktop went dark. This recurred often
enough to be the dominant reliability problem.

The Mini also runs the feeders (file/pi/claude/vault/git) and the Life OS
DuckDB→PG ingestion. The owner explicitly accepted that feeders may stop when
the Mini is offline.

## Decision

Move the whole web + data plane to the OVH VPS (`ovh-vps`, `100.101.106.60`,
SSH alias `ovhvps`). Feeders stay on the Mini and write to OVH Postgres over
Tailscale; they pause when the Mini sleeps.

Rejected: Next-only on OVH with Postgres left on the Mini — the phone would
still die when the Mini slept, so it doesn't address the problem.

### Topology

- **Next.js prod :3000** — systemd unit `activity-dashboard` (`Restart=always`).
- **Postgres :5433** — Docker, loopback-bound, volume `activity-log-data`,
  `wal_level=logical`.
- **electric-circuits ds/engine/api** — Docker compose; ports rebound to
  loopback via `ops/ovh/compose.ovh-ports.yaml` because Docker's published
  ports bypass ufw on a public IP.
- **Exposure** — Tailscale Serve only: HTTPS :8446 → :3000, and tailnet TCP
  :5433 for feeders. Nothing on the public NIC except SSH.
- **Canonical URL** — `https://ovh-vps.taila1553c.ts.net:8446` (was
  `bens-mac-mini…:8446`). Phone PWA re-added once from the new URL.
- **Backups** — daily `pg_dump` cron on the VPS, 14-day retention.

## Consequences

### Positive
- PWA stays up when the Mini sleeps/hangs.
- Electric images are built from source on the VPS (x86_64); the Mini's arm64
  images are not portable, which is now documented.
- Clear loopback + Tailscale-only security posture on a public host.

### Negative / tradeoffs
- Feeder events pause while the Mini is asleep (accepted).
- Two hosts to reason about; deploys are an rsync + `npm ci && build && restart`.
- `/market-lake` rewrite still targets `127.0.0.1:9077`, which only exists on
  the Mini — that feature is broken from the OVH origin until proxied.

### Related follow-up
- Channel `@pi` hung after cutover until stdin was ignored on spawn — see [ADR-006](ADR-006-pi-channel-stdin.md).

## References

- Live runbook: `openwiki/deployment/ovh-production.md`
- Historical plan/record: `ops/OVH-MIGRATION-PLAN.md`
- Superseded Mini setup: `openwiki/deployment/tailscale-and-pwa.md`
- Vault: ADR-2026-07-25 (production on OVH) + `[[activity-feed-ovh-migration]]`
