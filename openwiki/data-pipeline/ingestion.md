---
type: Data Pipeline
title: Data Ingestion
description: DuckDB to Postgres sync for Life OS finance data, Postgres schema, and electric-circuits table replication.
tags: [data-pipeline, duckdb, postgres, ingestion, sync, finance]
---

# Data Ingestion

The ingestion pipeline syncs Life OS finance data from a local DuckDB analytical database into Postgres, where electric-circuits picks it up via logical replication and streams it to the dashboard.

As of 2026-07-25, **Postgres and electric-circuits run on the OVH VPS**, not the Mac Mini. DuckDB and the sync script still run on the Mini and write to OVH over Tailscale (`ovh-vps.taila1553c.ts.net:5433`). See [OVH Production](../deployment/ovh-production.md).

## Pipeline Overview

```
~/.life/analytical/footprint.duckdb (DuckDB on Mac Mini, 95 GB)
    │
    ▼  python3 ingestion/sync_lifeos_to_pg.py  (runs on Mini)
    │
Postgres on OVH (activity-log-db, :5433, user: activity, db: activity_log)
    │
    ▼  logical replication (REPLICA IDENTITY FULL)
    │
electric-circuits engine on OVH (Docker, :7011)
    │
    ▼  /v1/shape (Z-set deltas)
    │
Next.js PWA on OVH (@electric-circuits/client)
```

## Ingestion Script

**File:** `dashboard/ingestion/sync_lifeos_to_pg.py`

**Dependencies:** `duckdb`, `psycopg`, `psycopg-binary`, Python 3.12+

**Usage:**
```bash
# One-time sync
python3 sync_lifeos_to_pg.py --once

# On a schedule (runs once, meant for cron/launchd)
python3 sync_lifeos_to_pg.py
```

**What it syncs:**

| DuckDB Table | Postgres Table | Description |
|---|---|---|
| `finance.positions` | `portfolio_positions` | All account holdings |
| `finance.trades` | `portfolio_trades` | Complete trade history |
| `finance.balances` | `portfolio_balances` | Cash account balances |
| `finance.net_worth_daily` | `portfolio_net_worth` | Daily net worth snapshots |
| `finance.benchmarks` | `portfolio_benchmarks` | SPY + VIX daily prices |
| `finance.v_allocation` | `portfolio_allocation` | Asset class weights |
| (computed from trades) | `portfolio_option_positions` | Live option positions (hedge engine, not electric-circuits) |

**Sync strategy:**
- `portfolio_net_worth` and `portfolio_allocation` — upsert by primary key (idempotent)
- All others — `DELETE` + `INSERT` batches of 100 rows (handles schema drift)

## Postgres Schema

The 6 finance tables require `REPLICA IDENTITY FULL` for electric-circuits logical replication. `portfolio_option_positions` does **not** — it is read directly by the hedge engine and is not replicated:

```sql
ALTER TABLE portfolio_positions REPLICA IDENTITY FULL;
ALTER TABLE portfolio_trades REPLICA IDENTITY FULL;
ALTER TABLE portfolio_balances REPLICA IDENTITY FULL;
ALTER TABLE portfolio_net_worth REPLICA IDENTITY FULL;
ALTER TABLE portfolio_benchmarks REPLICA IDENTITY FULL;
ALTER TABLE portfolio_allocation REPLICA IDENTITY FULL;
-- portfolio_option_positions: omitted intentionally (hedge engine direct read)
```

Each table includes an `updated_at TIMESTAMPTZ DEFAULT NOW()` column for tracking.

## Electric-Circuits Engine Configuration

The engine's Docker Compose override (`ops/ovh/compose.activity-feed.yaml` on the VPS) lists all tables to replicate via `ELECTRIC_CIRCUITS_PG_TABLES`. Finance tables in `REQUIRED_TABLES` (see ingestion script) are the set that requires `REPLICA IDENTITY FULL`. After adding new schema tables, rsync and restart the engine with `--force-recreate` on the VPS.

On restart, the engine creates a replication slot, performs initial snapshot, and begins streaming changes.

## Activity Log Feeders

Separate from the finance pipeline, feeders write to the `activity_log` (and related) tables. All live in `feeders/`:

- **pi-watcher.js** / **pi-session-watcher.js** — tail pi agent logs and session events
- **pi-backfill.js** / **pi-session-backfill.js** — backfill historical pi session data
- **iii-session-feed.js** — feeds iii (coding agent) session events
- **claude-hook.sh** / **claude-transcript-watcher.js** — Claude Code hook integration
- **git-post-commit.sh** — git post-commit hook in monitored repos (`install-git-hooks.sh` installs it)
- **vault-channel-sync.js** — syncs Vault notes into channels
- **auto-judge.js** — automated judgment pipeline over activity spans
- **timeline-to-agentruns.js** — converts timeline entries to agent-run records
