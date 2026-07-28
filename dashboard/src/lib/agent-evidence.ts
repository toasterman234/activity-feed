import { pool } from "@/app/api/_db";

const SOURCES: Record<string, string[]> = {
  "agent:claude": ["claude-code"],
  "agent:pi": ["omp"],
};

export async function getAgentEvidence(agentId: string) {
  const sources = SOURCES[agentId];
  if (!sources) return null;

  const [summary, recentRuns, collections] = await Promise.all([
    pool.query<{
      total: number; success: number; failed: number; drifted: number;
      dead_end: number; unknown: number; avg_duration_ms: number | null;
    }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE outcome = 'success')::int AS success,
              count(*) FILTER (WHERE outcome = 'failed')::int AS failed,
              count(*) FILTER (WHERE outcome = 'drifted')::int AS drifted,
              count(*) FILTER (WHERE outcome = 'dead_end')::int AS dead_end,
              count(*) FILTER (WHERE outcome = 'unknown')::int AS unknown,
              avg(duration_ms)::bigint AS avg_duration_ms
       FROM agent_runs WHERE source = ANY($1::text[])`,
      [sources],
    ),
    pool.query(
      `SELECT id, agent_id, COALESCE(project, '') AS project,
              COALESCE(operation, '') AS operation, started_at, duration_ms,
              outcome, outcome_source, headline, summary, raw_ref
       FROM agent_runs WHERE source = ANY($1::text[])
       ORDER BY started_at DESC NULLS LAST LIMIT 12`,
      [sources],
    ),
    pool.query(
      `SELECT c.id, c.name, c.kind, c.description,
              count(j.id)::int AS judgments,
              count(j.id) FILTER (WHERE j.verdict IN ('good', 'golden', 'fail_then_pass'))::int AS passing,
              count(j.id) FILTER (WHERE j.verdict IN ('bad', 'bug'))::int AS failing
       FROM judgment_collections c
       LEFT JOIN judgments j ON j.collection_id = c.id
       WHERE c.kind IN ('eval', 'regression', 'watchlist')
       GROUP BY c.id, c.name, c.kind, c.description
       ORDER BY CASE c.kind WHEN 'regression' THEN 0 WHEN 'eval' THEN 1 ELSE 2 END,
                count(j.id) DESC`,
    ),
  ]);

  const row = summary.rows[0];
  const decided = row.success + row.failed + row.drifted + row.dead_end;
  return {
    agentId,
    generatedAt: new Date().toISOString(),
    identity: {
      registryAgentId: agentId,
      sources,
      note: "agent_runs.agent_id is currently treated as the session identifier.",
    },
    summary: {
      ...row,
      decided,
      successRate: decided ? row.success / decided : 0,
      failureRate: decided ? (row.failed + row.dead_end) / decided : 0,
      driftRate: decided ? row.drifted / decided : 0,
    },
    recentRuns: recentRuns.rows.map((run) => ({ ...run, sessionId: run.agent_id })),
    evalSuites: collections.rows,
    improvementSignals: [
      row.drifted > 0
        ? { id: "reduce-drift", label: "Reduce instruction drift", evidence: `${row.drifted} drifted sessions`, target: "instructions" }
        : null,
      row.dead_end > 0
        ? { id: "recover-dead-ends", label: "Improve recovery strategy", evidence: `${row.dead_end} dead-end sessions`, target: "workflow" }
        : null,
      row.failed > 0
        ? { id: "failure-regression", label: "Build a failure regression suite", evidence: `${row.failed} failed sessions`, target: "eval-suite" }
        : null,
      row.unknown > decided
        ? { id: "expand-judging", label: "Improve outcome coverage", evidence: `${row.unknown} sessions have unknown outcomes`, target: "scoring" }
        : null,
    ].filter(Boolean),
  };
}
