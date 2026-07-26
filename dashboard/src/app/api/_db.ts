import { Pool } from "pg";

// activity-log-db is the source Postgres database
// of truth, replicated one-way (Postgres -> engine) by electric-circuits.
// App writes must land here directly, not through the electric-circuits
// client's write() (that appends to the durable-streams log only, which
// this deployment's "Postgres mode" never reads back from).
const connectionString =
  process.env.ACTIVITY_DB_URL || "postgres://activity:activity@localhost:5433/activity_log";

declare global {
  // eslint-disable-next-line no-var
  var __activityDbPool: Pool | undefined;
}

export const pool = global.__activityDbPool ?? new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
if (process.env.NODE_ENV !== "production") global.__activityDbPool = pool;
