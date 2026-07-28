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
    ALTER TABLE thread_meta
      ADD COLUMN IF NOT EXISTS template_version integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS template_snapshot text,
      ADD COLUMN IF NOT EXISTS stage_started_at text,
      ADD COLUMN IF NOT EXISTS created_at text;

    ALTER TABLE thread_plans
      ADD COLUMN IF NOT EXISTS stage_id text,
      ADD COLUMN IF NOT EXISTS acceptance_criteria text NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS dependencies text NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS assignee text;

    ALTER TABLE thread_artifacts
      ADD COLUMN IF NOT EXISTS stage_id text,
      ADD COLUMN IF NOT EXISTS task_id text;

    CREATE TABLE IF NOT EXISTS thread_workflow_events (
      id text PRIMARY KEY,
      thread_id text NOT NULL,
      channel_id text NOT NULL,
      template_id text NOT NULL,
      template_version integer NOT NULL,
      event_type text NOT NULL,
      from_state text,
      to_state text,
      actor text NOT NULL,
      payload text NOT NULL DEFAULT '{}',
      created_at text NOT NULL
    );

    CREATE INDEX IF NOT EXISTS thread_workflow_events_thread_idx
      ON thread_workflow_events (thread_id, created_at);

    CREATE TABLE IF NOT EXISTS workflow_templates (
      template_id text NOT NULL,
      version integer NOT NULL,
      label text NOT NULL,
      description text NOT NULL,
      definition text NOT NULL,
      status text NOT NULL DEFAULT 'published',
      checksum text NOT NULL,
      created_at text NOT NULL,
      published_at text,
      PRIMARY KEY (template_id, version)
    );

    CREATE TABLE IF NOT EXISTS thread_stage_interactions (
      id text PRIMARY KEY,
      thread_id text NOT NULL,
      stage_id text NOT NULL,
      role text NOT NULL,
      kind text NOT NULL,
      content text NOT NULL DEFAULT '',
      payload text NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'active',
      created_at text NOT NULL
    );

    CREATE INDEX IF NOT EXISTS thread_stage_interactions_thread_idx
      ON thread_stage_interactions (thread_id, stage_id, created_at);

    CREATE TABLE IF NOT EXISTS thread_links (
      id text PRIMARY KEY,
      source_thread_id text NOT NULL,
      target_thread_id text NOT NULL,
      relation text NOT NULL,
      created_at text NOT NULL,
      UNIQUE (source_thread_id, target_thread_id, relation)
    );

    CREATE INDEX IF NOT EXISTS thread_links_source_idx
      ON thread_links (source_thread_id, created_at);

    CREATE INDEX IF NOT EXISTS thread_links_target_idx
      ON thread_links (target_thread_id, created_at);

    CREATE TABLE IF NOT EXISTS thread_context_scans (
      id text PRIMARY KEY,
      thread_id text NOT NULL,
      stage_id text NOT NULL,
      query text NOT NULL,
      sources text NOT NULL DEFAULT '[]',
      status text NOT NULL DEFAULT 'running',
      created_at text NOT NULL,
      completed_at text
    );

    CREATE INDEX IF NOT EXISTS thread_context_scans_thread_idx
      ON thread_context_scans (thread_id, created_at);

    CREATE TABLE IF NOT EXISTS thread_context_candidates (
      id text PRIMARY KEY,
      scan_id text NOT NULL,
      thread_id text NOT NULL,
      source text NOT NULL,
      source_ref text NOT NULL,
      excerpt text NOT NULL,
      relevance text NOT NULL,
      confidence double precision,
      sensitivity text NOT NULL DEFAULT 'personal',
      status text NOT NULL DEFAULT 'pending',
      created_at text NOT NULL
    );

    CREATE INDEX IF NOT EXISTS thread_context_candidates_thread_idx
      ON thread_context_candidates (thread_id, created_at);
  `);

  await client.query(`
    UPDATE channels
       SET default_lifecycle = CASE lower(name)
         WHEN 'research' THEN 'research'
         WHEN 'quant' THEN 'research'
         WHEN 'thoughts/ideas' THEN 'planning'
         WHEN 'meta' THEN 'planning'
         WHEN 'issues' THEN 'issue'
         ELSE 'coding'
       END
     WHERE default_lifecycle IS NULL OR default_lifecycle = '';
  `);

  await client.query(`
    INSERT INTO thread_meta (
      thread_id, channel_id, lifecycle, state, enabled_workflows,
      template_version, stage_started_at, created_at, updated_at
    )
    SELECT
      m.id,
      m.channel_id,
      COALESCE(NULLIF(c.default_lifecycle, ''), 'coding'),
      CASE COALESCE(NULLIF(c.default_lifecycle, ''), 'coding')
        WHEN 'issue' THEN 'open'
        ELSE 'drafted'
      END,
      CASE COALESCE(NULLIF(c.default_lifecycle, ''), 'coding')
        WHEN 'research' THEN '["cross-check","cite-verify"]'
        WHEN 'planning' THEN '["task-breakdown"]'
        WHEN 'issue' THEN '["categorize"]'
        ELSE '["unit-tests"]'
      END,
      1,
      m.created_at,
      m.created_at,
      m.created_at
    FROM messages m
    JOIN channels c ON c.id = m.channel_id
    LEFT JOIN thread_meta tm ON tm.thread_id = m.id
    WHERE m.thread_id IS NULL
      AND tm.thread_id IS NULL;
  `);

  await client.query(`
    UPDATE thread_meta tm
       SET template_version = COALESCE(template_version, 1),
           stage_started_at = COALESCE(stage_started_at, updated_at),
           created_at = COALESCE(tm.created_at, root.created_at, tm.updated_at)
      FROM messages root
     WHERE root.id = tm.thread_id;
  `);

  await client.query(`
    INSERT INTO thread_workflow_events (
      id, thread_id, channel_id, template_id, template_version,
      event_type, from_state, to_state, actor, payload, created_at
    )
    SELECT
      md5(tm.thread_id || ':workflow-created'),
      tm.thread_id,
      tm.channel_id,
      tm.lifecycle,
      tm.template_version,
      'workflow.created',
      NULL,
      tm.state,
      'migration',
      '{"backfilled":true}',
      COALESCE(tm.created_at, tm.updated_at)
    FROM thread_meta tm
    WHERE NOT EXISTS (
      SELECT 1
        FROM thread_workflow_events e
       WHERE e.thread_id = tm.thread_id
         AND e.event_type = 'workflow.created'
    );
  `);

  await client.query("COMMIT");
  console.log("workflow cockpit schema and backfill applied");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
