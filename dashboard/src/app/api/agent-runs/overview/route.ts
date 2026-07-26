import { NextResponse } from "next/server";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Run queries sequentially to avoid saturating the pool over Tailscale
    const totalRes = await pool.query<{ source: string; count: string }>(
      `SELECT source, count(*)::int AS count FROM agent_runs GROUP BY source ORDER BY count DESC`
    );

    const outcomeRes = await pool.query<{ source: string; outcome: string; count: string }>(
      `SELECT source, outcome, count(*)::int AS count FROM agent_runs GROUP BY source, outcome ORDER BY source, count DESC`
    );

    const weeklyRes = await pool.query<{ week: string; source: string; total: string; success: string; drifted: string; dead: string; failed: string }>(
      `SELECT
         to_char(started_at::timestamp, 'IYYY-IW') AS week,
         source,
         count(*)::int AS total,
         count(*) FILTER (WHERE outcome = 'success')::int AS success,
         count(*) FILTER (WHERE outcome = 'drifted')::int AS drifted,
         count(*) FILTER (WHERE outcome = 'dead_end')::int AS dead,
         count(*) FILTER (WHERE outcome = 'failed')::int AS failed
       FROM agent_runs
       WHERE started_at IS NOT NULL
         AND started_at >= (now() - interval '8 weeks')::text
       GROUP BY week, source
       ORDER BY week DESC, source`
    );

    const driftRes = await pool.query<{ source: string; total: string; drifted: string }>(
      `SELECT source, count(*)::int AS total,
              count(*) FILTER (WHERE outcome = 'drifted')::int AS drifted
       FROM agent_runs GROUP BY source ORDER BY total DESC`
    );

    const judgedRes = await pool.query<{ outcome_source: string; count: string }>(
      `SELECT outcome_source, count(*)::int AS count FROM agent_runs GROUP BY outcome_source`
    );

    const projectFailRes = await pool.query<{ project: string; total: string; success: string; fail: string }>(
      `SELECT
         COALESCE(NULLIF(project, ''), '(unknown)') AS project,
         count(*)::int AS total,
         count(*) FILTER (WHERE outcome = 'success')::int AS success,
         count(*) FILTER (WHERE outcome IN ('failed','dead_end','drifted'))::int AS fail
       FROM agent_runs
       GROUP BY project
       HAVING count(*) >= 3
       ORDER BY fail DESC, total DESC
       LIMIT 10`
    );

    const agentRes = await pool.query<{ agent_id: string; source: string; total: string; success: string; fail: string; drift: string }>(
      `SELECT
         COALESCE(NULLIF(agent_id, ''), '(unknown)') AS agent_id,
         source,
         count(*)::int AS total,
         count(*) FILTER (WHERE outcome = 'success')::int AS success,
         count(*) FILTER (WHERE outcome IN ('failed','dead_end'))::int AS fail,
         count(*) FILTER (WHERE outcome = 'drifted')::int AS drift
       FROM agent_runs
       GROUP BY agent_id, source
       HAVING count(*) >= 2
       ORDER BY total DESC
       LIMIT 20`
    );

    // Remap by-source outcome counts into a nested structure
    const bySourceOutcome: Record<string, Record<string, number>> = {};
    for (const row of outcomeRes.rows) {
      const s = row.source || "unknown";
      bySourceOutcome[s] ??= {};
      bySourceOutcome[s][row.outcome || "unknown"] = Number(row.count);
    }

    // Weekly trends: nest by source
    const weeklyTrends: Record<string, Array<{ week: string; total: number; successRate: number; driftRate: number }>> = {};
    for (const row of weeklyRes.rows) {
      const s = row.source || "unknown";
      weeklyTrends[s] ??= [];
      const total = Number(row.total);
      weeklyTrends[s].push({
        week: row.week,
        total,
        successRate: total ? Number(row.success) / total : 0,
        driftRate: total ? Number(row.drifted) / total : 0,
      });
    }

    const driftBySource: Record<string, { total: number; drifted: number; rate: number }> = {};
    for (const row of driftRes.rows) {
      const total = Number(row.total);
      const drifted = Number(row.drifted);
      driftBySource[row.source] = { total, drifted, rate: total ? drifted / total : 0 };
    }

    const judgedCounts: Record<string, number> = {};
    let totalJudged = 0;
    for (const row of judgedRes.rows) {
      judgedCounts[row.outcome_source] = Number(row.count);
      totalJudged += Number(row.count);
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totals: totalRes.rows.map((r) => ({ source: r.source, count: Number(r.count) })),
      bySourceOutcome,
      weeklyTrends,
      topFailing: projectFailRes.rows.map((r) => ({
        project: r.project,
        total: Number(r.total),
        success: Number(r.success),
        fail: Number(r.fail),
      })),
      byAgent: agentRes.rows.map((r) => ({
        agentId: r.agent_id,
        source: r.source,
        total: Number(r.total),
        success: Number(r.success),
        fail: Number(r.fail),
        drift: Number(r.drift),
      })),
      judged: {
        bySource: judgedCounts,
        total: totalJudged,
        pctAutoJudged: judgedCounts["auto_judge"] ? judgedCounts["auto_judge"] / totalJudged : 0,
        pctHumanJudged: judgedCounts["human"] ? judgedCounts["human"] / totalJudged : 0,
      },
      driftBySource,
    });
  } catch (error) {
    console.error("[agent-runs/overview] failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
