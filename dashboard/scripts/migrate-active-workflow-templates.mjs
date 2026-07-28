import { randomUUID } from "crypto";
import pg from "pg";

const apply = process.argv.includes("--apply");
const includeTerminal = process.argv.includes("--include-terminal");
const connectionString =
  process.env.ACTIVITY_DB_URL ||
  "postgres://activity:activity@localhost:5433/activity_log";
const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query("BEGIN");
  const result = await client.query(`
    SELECT tm.thread_id, tm.channel_id, tm.lifecycle, tm.state, tm.template_version,
           wt.version AS next_version, wt.definition
      FROM thread_meta tm
      JOIN LATERAL (
        SELECT version, definition
          FROM workflow_templates
         WHERE template_id = tm.lifecycle AND status = 'published'
         ORDER BY version DESC
         LIMIT 1
      ) wt ON true
     WHERE tm.archived_at IS NULL
       AND wt.version > tm.template_version
     ORDER BY tm.lifecycle, tm.state, tm.thread_id
  `);

  const migrations = [];
  for (const row of result.rows) {
    const definition = JSON.parse(row.definition);
    const stage = definition.states?.[row.state];
    if (!stage || (stage.terminal && !includeTerminal)) continue;
    migrations.push(row);
    if (!apply) continue;
    const now = new Date().toISOString();
    await client.query(
      `UPDATE thread_meta
          SET template_version = $2, template_snapshot = $3, updated_at = $4
        WHERE thread_id = $1`,
      [row.thread_id, row.next_version, row.definition, now],
    );
    await client.query(
      `INSERT INTO thread_workflow_events (
         id, thread_id, channel_id, template_id, template_version,
         event_type, from_state, to_state, actor, payload, created_at
       ) VALUES ($1, $2, $3, $4, $5, 'workflow.template_changed', $6, $6,
                 'registry migration', $7, $8)`,
      [
        randomUUID(), row.thread_id, row.channel_id, row.lifecycle,
        row.next_version, row.state,
        JSON.stringify({ fromVersion: row.template_version, toVersion: row.next_version }),
        now,
      ],
    );
  }

  if (apply) await client.query("COMMIT");
  else await client.query("ROLLBACK");
  console.log(JSON.stringify({
    mode: apply ? "applied" : "dry-run",
    includeTerminal,
    count: migrations.length,
    migrations: migrations.map((row) => ({
      threadId: row.thread_id,
      lifecycle: row.lifecycle,
      state: row.state,
      fromVersion: row.template_version,
      toVersion: row.next_version,
    })),
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
