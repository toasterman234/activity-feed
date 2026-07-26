#!/usr/bin/env node
// Bridge: timeline.db → Postgres agent_runs.
// Reads every timeline_events row and upserts into Postgres with a
// deterministic outcome mapping. Idempotent — safe to run as a periodic
// sync (every few minutes) or as a one-shot backfill.
//
// Outcome mapping (deterministic, source = "hook"):
//   dead_end = 1    → dead_end
//   drifted  = 1    → drifted
//   error != null   → failed
//   accomplished_json non-empty  → success
//   else            → unknown
//
// Precedence (human > auto_judge > hook):
//   Never overwrite a human or auto_judge outcome with a hook one.
//   Hook-to-hook is fine (re-sync with fresh data).

const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('pg');

const HOME = os.homedir();
const TIMELINE_DB = path.join(HOME, 'central-ops-dashboard', 'timeline.db');
const DB_URL = process.env.ACTIVITY_DB_URL || 'postgres://activity:activity@localhost:5433/activity_log';

function mapOutcome(row) {
  // Deterministic priority order per the plan.
  if (row.dead_end === 1 || row.dead_end === '1' || row.dead_end === true) return 'dead_end';
  if (row.drifted === 1 || row.drifted === '1' || row.drifted === true) return 'drifted';
  if (row.error && row.error !== '') return 'failed';
  // accomplished_json is a JSON array string, e.g. '["did X","did Y"]' or '[]'
  let acc = row.accomplished_json ? String(row.accomplished_json) : '';
  // Trim whitespace; empty array counts as empty
  acc = acc.trim();
  if (acc !== '' && acc !== '[]' && acc !== 'null') return 'success';
  return 'unknown';
}

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  // Read timeline.db as JSON (sqlite3 ships on macOS; better-sqlite3 is not
  // installed in this project and we don't want a new C++ dep).
  const stdout = execFileSync('sqlite3', [
    '-json', TIMELINE_DB,
    `SELECT id, source, operation, status, started_at, ended_at,
            duration_ms, prompt_count, agent_id, cwd, project, error,
            headline, accomplished_json, open_json, drifted, dead_end,
            judged_at, judgment_provenance, summary
     FROM timeline_events`,
  ], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, timeout: 30_000 });

  const rows = JSON.parse(stdout.trim() || '[]');
  let inserted = 0, updated = 0, skipped = 0;

  // Get existing outcome_sources for precedence checks
  const existing = new Map();
  const existingRes = await client.query(
    `SELECT id, outcome_source FROM agent_runs`
  );
  for (const r of existingRes.rows) {
    existing.set(r.id, r.outcome_source || 'hook');
  }

  for (const row of rows) {
    const outcome = mapOutcome(row);
    const existingSource = existing.get(row.id);

    // Precedence gate: never let hook overwrite human or auto_judge
    if (existingSource === 'human' || existingSource === 'auto_judge') {
      skipped++;
      continue;
    }

    // Build raw_ref — path to transcript for later auto-judge drill-down
    const rawRef = `${row.source}:${row.id}`;

    // outcome_score: simple proxy — 1.0 for success, 0.0 for dead_end/failed,
    // 0.5 for drifted/partial/unknown. Will be refined by auto-judge (Phase 3).
    let outcomeScore = null;
    if (outcome === 'success') outcomeScore = 1.0;
    else if (outcome === 'dead_end' || outcome === 'failed') outcomeScore = 0.0;
    else if (outcome === 'drifted') outcomeScore = 0.5;
    // 'partial' and 'unknown' stay null — not enough signal.

    if (existing.has(row.id)) {
      // Hook-to-hook re-sync: update all fields
      await client.query(
        `UPDATE agent_runs SET
           source = $2, agent_id = $3, project = $4, cwd = $5,
           operation = $6, started_at = $7, ended_at = $8,
           duration_ms = $9, prompt_count = $10, error = $11,
           outcome = $12, outcome_score = $13, outcome_source = $14,
           drifted = $15, dead_end = $16, headline = $17, summary = $18,
           judged_at = $19, raw_ref = $20
         WHERE id = $1`,
        [
          row.id, row.source,
          row.agent_id || null,
          row.project || null,
          row.cwd || null,
          row.operation || null,
          row.started_at || null,
          row.ended_at || null,
          row.duration_ms || null,
          row.prompt_count || null,
          row.error || null,
          outcome,
          outcomeScore,
          'hook', // outcome_source
          (row.drifted === 1 || row.drifted === '1' || row.drifted === true),
          (row.dead_end === 1 || row.dead_end === '1' || row.dead_end === true),
          row.headline || null,
          row.summary || null,
          row.judged_at || null,
          rawRef,
        ],
      );
      updated++;
    } else {
      await client.query(
        `INSERT INTO agent_runs
           (id, source, agent_id, project, cwd, operation,
            started_at, ended_at, duration_ms, prompt_count, error,
            outcome, outcome_score, outcome_source,
            drifted, dead_end, headline, summary, judged_at, raw_ref)
         VALUES
           ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
            $12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          row.id, row.source,
          row.agent_id || null,
          row.project || null,
          row.cwd || null,
          row.operation || null,
          row.started_at || null,
          row.ended_at || null,
          row.duration_ms || null,
          row.prompt_count || null,
          row.error || null,
          outcome,
          outcomeScore,
          'hook',
          (row.drifted === 1 || row.drifted === '1' || row.drifted === true),
          (row.dead_end === 1 || row.dead_end === '1' || row.dead_end === true),
          row.headline || null,
          row.summary || null,
          row.judged_at || null,
          rawRef,
        ],
      );
      inserted++;
    }
  }

  console.log(
    `[timeline-to-agentruns] ${rows.length} timeline rows: ` +
    `${inserted} inserted, ${updated} updated, ${skipped} skipped (protected)`,
  );

  await client.end();
}

main().catch((err) => {
  console.error('[timeline-to-agentruns] fatal:', err);
  process.exit(1);
});
