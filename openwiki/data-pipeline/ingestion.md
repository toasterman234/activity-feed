---
type: Data Pipeline
title: Data Ingestion
description: DuckDB to Postgres sync for Life OS finance data, Postgres schema, and electric-circuits table replication.
tags: [data-pipeline, duckdb, postgres, ingestion, sync, finance]
---

# Data Ingestion

The ingestion pipeline syncs Life OS finance data from a local DuckDB analytical database into Postgres, where electric-circuits picks it up via logical replication and streams it to the dashboard.

## Pipeline Overview

```
~/.life/analytical/footprint.duckdb (DuckDB, 95 GB)
    │
    ▼  python3 ingestion/sync_lifeos_to_pg.py
    │
Postgres (activity-log-db, :5433, user: activity, db: activity_log)
    │
    ▼  logical replication (REPLICA IDENTITY FULL)
    │
electric-circuits engine (Docker, :7011)
    │
    ▼  /v1/shape (Z-set deltas)
    │
Next.js PWA (@electric-circuits/client)
```

## Ingestion Script

**File:** `dashboard/ingestion/sync_lifeos_to_pg.py`

**Dependencies:** `duckdb`, `psycopg[binary]`, Python 3.12+

**Usage:**
```bash
# One-time sync
python3 sync_lifeos_to_pg.py --once

# On a schedule (runs once, meant for cron/launchd)
python3 sync_lifeos_to_pg.py
```

**What it syncs (6 tables):**

| DuckDB Table | Postgres Table | Rows | Description |
|---|---|---|---|
| `finance.positions` | `portfolio_positions` | 44 | All account holdings |
| `finance.trades` | `portfolio_trades` | 5,450 | Complete trade history |
| `finance.balances` | `portfolio_balances` | 9 | Cash account balances |
| `finance.net_worth_daily` | `portfolio_net_worth` | 19 | Daily net worth snapshots |
| `finance.benchmarks` | `portfolio_benchmarks` | 8,879 | SPY + VIX daily prices |
| `finance.v_allocation` | `portfolio_allocation` | 4 | Asset class weights |

**Sync strategy:**
- `portfolio_net_worth` and `portfolio_allocation` — upsert by primary key (idempotent)
- All others — `DELETE` + `INSERT` batches of 100 rows (handles schema drift)

## Postgres Schema

All tables require `REPLICA IDENTITY FULL` for electric-circuits logical replication:

```sql
ALTER TABLE portfolio_positions REPLICA IDENTITY FULL;
ALTER TABLE portfolio_trades REPLICA IDENTITY FULL;
ALTER TABLE portfolio_balances REPLICA IDENTITY FULL;
ALTER TABLE portfolio_net_worth REPLICA IDENTITY FULL;
ALTER TABLE portfolio_benchmarks REPLICA IDENTITY FULL;
ALTER TABLE portfolio_allocation REPLICA IDENTITY FULL;
```

Each table includes an `updated_at TIMESTAMPTZ DEFAULT NOW()` column for tracking.

## Electric-Circuits Engine Configuration

The engine's Docker Compose override (`docker/compose.activity-feed.yaml`) lists all tables to replicate:

```yaml
ELECTRIC_REPLICATION_TABLES: >
  activity_log,
  portfolio_positions,
  portfolio_trades,
  portfolio_balances,
  portfolio_net_worth,
  portfolio_benchmarks,
  portfolio_allocation
```

On restart, the engine creates a replication slot, performs initial snapshot, and begins streaming changes.

## Activity Log Feeders

Separate from the finance pipeline, three feeders write to the `activity_log` table:

- **file-watcher.js** — watches `/Users/bencharney` for file create/modify/delete events
- **pi-watcher.js** — tail -f on pi agent logs
- **git-post-commit.sh** — git post-commit hook in monitored repos
