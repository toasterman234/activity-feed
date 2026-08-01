#!/usr/bin/env node
// Feeder: iii session JSONL → Postgres agent_runs.
// Reads iii session files from /opt/iii/data/session-manager/, parses each
// session's first and last event, and upserts into agent_runs with source = 'iii'.
// Idempotent — safe to run periodically.

const { execFileSync } = require("child_process");

const path = require("path");

const DB_URL = process.env.ACTIVITY_DB_URL || "postgres://activity:activity@localhost:5433/activity_log";

// On OVH, pg lives in dashboard/node_modules
let pg;
try {
  pg = require("pg");
} catch {
  pg = require(path.join(__dirname, "..", "dashboard", "node_modules", "pg"));
}

function formatDuration(startedMs, endedMs) {
  if (!startedMs || !endedMs) return null;
  const duration = endedMs - startedMs;
  return duration > 0 ? duration : null;
}

function mapOutcome(status) {
  switch (status) {
    case "done": return "success";
    case "error": return "failed";
    case "quarantined": return "dead_end";
    case "idle":
    case "active": return "unknown";
    default: return "unknown";
  }
}

async function main() {
  const { Client } = pg;
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  // Read session data from local filesystem (runs on OVH)
  let sessionData;
  try {
    const stdout = execFileSync("python3", ["-c",
      `import json, glob
results = []
for f in sorted(glob.glob("/opt/iii/data/session-manager/console-*.jsonl")):
    if ".bak" in f: continue
    sid = f.split("/")[-1].replace(".jsonl", "")
    try:
        with open(f) as fh:
            lines = [json.loads(l) for l in fh.readlines() if l.strip()]
            if not lines: continue
            first = lines[0]
            last = lines[-1]
            meta = first.get("meta", {}) if first.get("type") == "meta" else {}
            last_meta = last.get("meta", {}) if last.get("type") == "meta" else {}
            status = last_meta.get("status", meta.get("status", "unknown"))
            results.append({
                "id": sid,
                "title": meta.get("title", ""),
                "model": meta.get("metadata", {}).get("model", ""),
                "mode": meta.get("metadata", {}).get("mode", ""),
                "created_at_ms": meta.get("created_at"),
                "updated_at_ms": last_meta.get("updated_at", meta.get("updated_at")),
                "message_count": meta.get("message_count", len(lines)),
                "status": status,
            })
    except: pass
print(json.dumps(results))`,
    ], { timeout: 15000, maxBuffer: 2 * 1024 * 1024, encoding: "utf8" });
    sessionData = JSON.parse(stdout.trim() || "[]");
  } catch (err) {
    console.error("[iii-session-feed] Parse failed:", err.message);
    await client.end();
    process.exit(0);
  }

  if (!sessionData.length) {
    console.log("[iii-session-feed] No iii sessions found.");
    await client.end();
    process.exit(0);
  }

  let inserted = 0;
  let updated = 0;

  // Upsert each session into agent_runs
  for (const session of sessionData) {
    try {
      const outcome = mapOutcome(session.status);
      const durationMs = formatDuration(session.created_at_ms, session.updated_at_ms);
      const startedAt = session.created_at_ms
        ? new Date(session.created_at_ms).toISOString()
        : null;

      const title = session.title || "Untitled iii session";
      const summary = `iii ${session.mode || "agent"} session — ${session.message_count} messages, status: ${session.status}`;

      // Check if row exists
      const existing = await client.query(
        "SELECT id FROM agent_runs WHERE id = $1",
        [session.id],
      );

      if (existing.rows.length > 0) {
        // Update — but don't overwrite human/auto_judge outcomes
        await client.query(
          `UPDATE agent_runs SET
             source = 'iii',
             agent_id = $2,
             project = 'iii',
             cwd = '/opt/iii',
             operation = 'session',
             started_at = $3,
             duration_ms = $4,
             prompt_count = $5,
             headline = $6,
             summary = $7,
             outcome = CASE
               WHEN outcome_source IN ('human', 'auto_judge') THEN outcome
               ELSE $8
             END,
             outcome_source = CASE
               WHEN outcome_source IN ('human', 'auto_judge') THEN outcome_source
               ELSE 'hook'
             END,
             raw_ref = $9
           WHERE id = $1`,
          [
            session.id,
            `iii:${session.id.slice(0, 12)}`,
            startedAt,
            durationMs,
            session.message_count,
            title,
            summary,
            outcome,
            `iii-session:${session.id}`,
          ],
        );
        updated++;
      } else {
        await client.query(
          `INSERT INTO agent_runs
             (id, source, agent_id, project, cwd, operation,
              started_at, duration_ms, prompt_count,
              headline, summary,
              outcome, outcome_source, raw_ref)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            session.id,
            "iii",
            `iii:${session.id.slice(0, 12)}`,
            "iii",
            "/opt/iii",
            "session",
            startedAt,
            durationMs,
            session.message_count,
            title,
            summary,
            outcome,
            "hook",
            `iii-session:${session.id}`,
          ],
        );
        inserted++;
      }
    } catch (err) {
      console.error(`[iii-session-feed] Error upserting ${session.id}:`, err.message);
    }
  }

  console.log(`[iii-session-feed] ${sessionData.length} sessions: ${inserted} inserted, ${updated} updated`);
  await client.end();
}

main().catch((err) => {
  console.error("[iii-session-feed] Fatal:", err.message);
  process.exit(1);
});
