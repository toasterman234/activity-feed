#!/usr/bin/env node
// Creates the perf_metrics sink. Idempotent — safe to re-run.
//
// UNLOGGED is load-bearing, not an optimization: electric_circuits_pub is
// FOR ALL TABLES, so a normal table here would stream every perf row through
// logical replication into the Electric engine and add exactly the insert
// churn that perf monitoring exists to catch (see ADR-004). Postgres excludes
// unlogged tables from FOR ALL TABLES publications, so this stays out of WAL
// decoding entirely. Cost: rows are dropped if Postgres restarts uncleanly,
// which is fine for telemetry.

import { Pool } from "pg";

const connectionString =
  process.env.ACTIVITY_DB_URL || "postgres://activity:activity@localhost:5433/activity_log";

const pool = new Pool({ connectionString });

const DDL = [
  `CREATE UNLOGGED TABLE IF NOT EXISTS perf_metrics (
     id          BIGSERIAL PRIMARY KEY,
     ts          TIMESTAMPTZ      NOT NULL DEFAULT now(),
     kind        TEXT             NOT NULL,
     name        TEXT             NOT NULL,
     value       DOUBLE PRECISION NOT NULL,
     route       TEXT             NOT NULL,
     rating      TEXT,
     detail      JSONB,
     session_id  TEXT             NOT NULL,
     device      TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS perf_metrics_ts_idx ON perf_metrics (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS perf_metrics_lookup_idx ON perf_metrics (route, name, ts DESC)`,
];

try {
  for (const sql of DDL) await pool.query(sql);

  const pub = await pool.query(
    `SELECT 1 FROM pg_publication_tables WHERE tablename = 'perf_metrics'`,
  );
  if (pub.rowCount > 0) {
    console.error(
      "✕ perf_metrics is in a publication — it will add replication churn.\n" +
        "  The table was probably created LOGGED. Drop it and re-run this script.",
    );
    process.exit(1);
  }

  console.log("✓ perf_metrics ready (unlogged, not replicated)");
} catch (err) {
  console.error("✕ init-perf-metrics failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
