import { NextResponse } from "next/server";
import { pool } from "../_db";

// The full activity_log table is 20K+ rows / 30+MB — pulling all of it as the
// initial shape snapshot is what made the dashboard hang on "Connecting…"
// over Tailscale (WAN latency + a huge JSON parse). Return cutoff ids so the
// client can shape-filter to just the most recent rows.
// Without file-watcher noise, 500 rows covers ~2h on a busy day.
// Agent rows come via the id cutoff + the agent-specific created_at OR.
const RECENT_WINDOW = 500;
const AGENT_WINDOW_DAYS = 1; // catch pi-backfill rows (low ids, recent timestamps)

export async function GET() {
  const { rows } = await pool.query<{ max: number }>("SELECT max(id) FROM activity_log");
  const maxId = rows[0]?.max ?? 0;
  const cutoff = Math.max(0, maxId - RECENT_WINDOW);
  // A timestamp bound, not an id bound: pi backfill gave old rows low ids but
  // recent created_at (and vice versa), so min(id)-in-window degenerates to
  // "everything". created_at compares correctly on both the SQL side and the
  // client-side delta predicate (lexicographic on the serialized form).
  const since = new Date(Date.now() - AGENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // Match the engine's timestamptz serialization ("YYYY-MM-DD HH:MM:SS…+00")
  // so lexicographic comparison in the live predicate stays valid.
  const agentSince = since.toISOString().replace("T", " ").replace("Z", "+00");
  return NextResponse.json({ cutoff, agentSince });
}
