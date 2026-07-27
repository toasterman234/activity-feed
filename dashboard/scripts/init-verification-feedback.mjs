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
    CREATE TABLE IF NOT EXISTS repo_verification_profiles (
      repo_id text PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
      working_directory text,
      commands jsonb NOT NULL DEFAULT '[]'::jsonb,
      timeout_ms integer NOT NULL DEFAULT 120000 CHECK (timeout_ms BETWEEN 1000 AND 900000),
      max_feedback_cycles integer NOT NULL DEFAULT 2 CHECK (max_feedback_cycles BETWEEN 0 AND 10),
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS work_run_checks (
      id text PRIMARY KEY,
      run_id text NOT NULL REFERENCES work_runs(id) ON DELETE CASCADE,
      thread_id text NOT NULL,
      repo_id text,
      check_key text NOT NULL,
      label text NOT NULL,
      command text NOT NULL,
      required boolean NOT NULL DEFAULT true,
      status text NOT NULL
        CHECK (status IN ('running', 'passed', 'failed', 'skipped')),
      exit_code integer,
      output_excerpt text,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      UNIQUE (run_id, check_key)
    );

    CREATE INDEX IF NOT EXISTS work_run_checks_thread_idx
      ON work_run_checks (thread_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS issue_feedback_cycles (
      id text PRIMARY KEY,
      thread_id text NOT NULL,
      run_id text NOT NULL REFERENCES work_runs(id) ON DELETE CASCADE,
      cycle integer NOT NULL CHECK (cycle > 0),
      verdict text NOT NULL CHECK (verdict IN ('passed', 'action_required')),
      summary text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (run_id, cycle)
    );

    CREATE INDEX IF NOT EXISTS issue_feedback_cycles_thread_idx
      ON issue_feedback_cycles (thread_id, created_at DESC);
  `);
  await client.query("COMMIT");
  console.log("verification profiles and feedback schema applied");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
