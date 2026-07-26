import { NextResponse } from "next/server";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source");
    const outcome = searchParams.get("outcome");
    const project = searchParams.get("project");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (source) {
      conditions.push(`source = $${paramIdx++}`);
      params.push(source);
    }
    if (outcome) {
      conditions.push(`outcome = $${paramIdx++}`);
      params.push(outcome);
    }
    if (project) {
      conditions.push(`project ILIKE $${paramIdx++}`);
      params.push(`%${project}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rowsRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, source, agent_id, project, cwd, operation,
                started_at, ended_at, duration_ms, prompt_count, error,
                outcome, outcome_score, outcome_source,
                drifted, dead_end, headline, summary,
                judged_at, raw_ref
         FROM agent_runs
         ${where}
         ORDER BY started_at DESC NULLS LAST
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset],
      ),
      pool.query<{ count: string }>(
        `SELECT count(*)::int AS count FROM agent_runs ${where}`,
        params,
      ),
    ]);

    return NextResponse.json({
      rows: rowsRes.rows.map((r) => ({
        ...r,
        drifted: r.drifted ?? false,
        dead_end: r.dead_end ?? false,
        duration_ms: r.duration_ms ? Number(r.duration_ms) : null,
        prompt_count: r.prompt_count ? Number(r.prompt_count) : null,
        outcome_score: r.outcome_score ? Number(r.outcome_score) : null,
      })),
      total: Number(countRes.rows[0]?.count ?? 0),
      limit,
      offset,
    });
  } catch (error) {
    console.error("[agent-runs/list] failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
