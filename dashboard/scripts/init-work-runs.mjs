import pg from "pg";

const { Client } = pg;
const connectionString =
  process.env.ACTIVITY_DB_URL ||
  "postgres://activity:activity@localhost:5433/activity_log";

const client = new Client({ connectionString });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(`
    CREATE TABLE IF NOT EXISTS work_runs (
      id text PRIMARY KEY,
      request_id text NOT NULL,
      idempotency_key text NOT NULL UNIQUE,
      attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
      max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
      parent_run_id text,

      thread_id text NOT NULL,
      channel_id text NOT NULL,
      stage_id text NOT NULL,
      repo_id text,
      kind text NOT NULL DEFAULT 'channel.agent',
      status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'interrupted', 'cancelled')),

      agent_registry_id text NOT NULL,
      agent_version text,
      model text,
      config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
      config_hash text NOT NULL,

      worker_id text,
      worker_host text,
      lease_expires_at timestamptz,
      heartbeat_at timestamptz,
      cancel_requested_at timestamptz,

      cwd text,
      branch text,
      base_commit text,
      raw_ref text,
      request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      error_detail text,

      created_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      completed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),

      UNIQUE (request_id, attempt)
    );

    CREATE INDEX IF NOT EXISTS work_runs_thread_idx
      ON work_runs (thread_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS work_runs_status_idx
      ON work_runs (status, created_at);

    CREATE INDEX IF NOT EXISTS work_runs_lease_idx
      ON work_runs (lease_expires_at)
      WHERE status = 'running';

    CREATE INDEX IF NOT EXISTS work_runs_agent_idx
      ON work_runs (agent_registry_id, created_at DESC);
  `);
  await client.query("COMMIT");
  console.log("durable work-runs schema applied");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

