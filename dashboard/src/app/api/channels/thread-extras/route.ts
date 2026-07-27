import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId")?.trim();
  if (!threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  try {
    const [plans, steps, artifacts, meta, promotions, activity, graphEvents, graphDecisions, graphObservations, graphProposals] = await Promise.all([
      pool.query(
        `SELECT id, thread_id, title, status, sort_order, created_at, updated_at
           FROM thread_plans
          WHERE thread_id = $1
          ORDER BY sort_order ASC, created_at ASC`,
        [threadId],
      ),
      pool.query(
        `SELECT id, thread_id, step_label, status, detail, created_at
           FROM thread_workflow_steps
          WHERE thread_id = $1
          ORDER BY created_at ASC`,
        [threadId],
      ),
      pool.query(
        `SELECT id, thread_id, title, kind, content, version, created_at
           FROM thread_artifacts
          WHERE thread_id = $1
          ORDER BY created_at ASC`,
        [threadId],
      ),
      pool.query(
        `SELECT thread_id, channel_id, lifecycle, state, enabled_workflows,
                research_mode, priority, assignee, repo_id, labels,
                promoted_to, archived_at, updated_at
           FROM thread_meta
          WHERE thread_id = $1
          LIMIT 1`,
        [threadId],
      ),
      pool.query(
        `SELECT id, thread_id, repo_path, status, error_detail,
                agent_provider, agent_model, progress, created_at, completed_at
           FROM thread_promotions
          WHERE thread_id = $1
          ORDER BY created_at DESC`,
        [threadId],
      ),
      pool.query(
        `SELECT id, thread_id, run_id, seq, kind, label, detail, status, created_at, updated_at
           FROM thread_activity_events
          WHERE thread_id = $1
          ORDER BY created_at ASC, seq ASC`,
        [threadId],
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT id, thread_id, kind, actor, payload, caused_by, created_at
           FROM graph_events
          WHERE thread_id = $1
          ORDER BY created_at ASC
          LIMIT 50`,
        [threadId],
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT d.id, d.thread_id, d.statement, d.rationale, d.evidence, d.status, d.supersedes,
                sd.statement AS supersedes_statement,
                d.resolved_by, d.resolution_rationale, d.created_at, d.resolved_at
           FROM graph_decisions d
      LEFT JOIN graph_decisions sd ON sd.id = d.supersedes
          WHERE d.thread_id = $1
          ORDER BY d.created_at DESC
          LIMIT 20`,
        [threadId],
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT id, thread_id, source_id, category, text, confidence, created_at
           FROM graph_observations
          WHERE thread_id = $1
          ORDER BY created_at DESC
          LIMIT 30`,
        [threadId],
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT id, thread_id, hypothesis, capability_ids, changes, evidence, status,
                resolved_by, resolution_rationale, created_at, resolved_at
           FROM graph_proposals
          WHERE thread_id = $1
          ORDER BY created_at DESC
          LIMIT 20`,
        [threadId],
      ).catch(() => ({ rows: [] })),
    ]);

    const metaRow = meta.rows[0] as { channel_id?: string } | undefined;
    const channelId = metaRow?.channel_id || null;

    let continuity = {
      checkpoint: null,
      activeDecisions: [],
      acceptedMemory: [],
      pendingDecisionCount: 0,
      pendingProposalCount: 0,
      pendingMemoryCount: 0,
    } as {
      checkpoint: { text: string; created_at: string } | null;
      activeDecisions: unknown[];
      acceptedMemory: unknown[];
      pendingDecisionCount: number;
      pendingProposalCount: number;
      pendingMemoryCount: number;
    };

    if (channelId) {
      const [checkpoint, activeDecisions, acceptedMemory, pendingDecisionCount, pendingProposalCount, pendingMemoryCount] = await Promise.all([
        pool.query(
          `SELECT text, created_at
             FROM graph_observations
            WHERE channel_id = $1 AND (thread_id = $2 OR thread_id IS NULL) AND category = 'checkpoint'
            ORDER BY created_at DESC
            LIMIT 1`,
          [channelId, threadId],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT d.id, d.thread_id, d.statement, d.rationale, d.evidence, d.status, d.supersedes,
                  sd.statement AS supersedes_statement,
                  d.resolved_by, d.resolution_rationale, d.created_at, d.resolved_at
             FROM graph_decisions d
        LEFT JOIN graph_decisions sd ON sd.id = d.supersedes
            WHERE d.channel_id = $1 AND (d.thread_id = $2 OR d.thread_id IS NULL) AND d.status = 'active'
            ORDER BY d.created_at DESC
            LIMIT 10`,
          [channelId, threadId],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT id, thread_id, candidate_id, text, category, created_at
             FROM graph_memory_items
            WHERE channel_id = $1 AND (thread_id = $2 OR thread_id IS NULL)
            ORDER BY created_at DESC
            LIMIT 12`,
          [channelId, threadId],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT count(*)::int AS n
             FROM graph_decisions
            WHERE thread_id = $1 AND status = 'pending'`,
          [threadId],
        ).catch(() => ({ rows: [{ n: 0 }] })),
        pool.query(
          `SELECT count(*)::int AS n
             FROM graph_proposals
            WHERE thread_id = $1 AND status = 'pending'`,
          [threadId],
        ).catch(() => ({ rows: [{ n: 0 }] })),
        pool.query(
          `SELECT count(*)::int AS n
             FROM graph_memory_candidates
            WHERE thread_id = $1 AND status = 'pending'`,
          [threadId],
        ).catch(() => ({ rows: [{ n: 0 }] })),
      ]);

      continuity = {
        checkpoint: (checkpoint.rows[0] as { text: string; created_at: string } | undefined) || null,
        activeDecisions: activeDecisions.rows,
        acceptedMemory: acceptedMemory.rows,
        pendingDecisionCount: Number((pendingDecisionCount.rows[0] as { n?: number } | undefined)?.n || 0),
        pendingProposalCount: Number((pendingProposalCount.rows[0] as { n?: number } | undefined)?.n || 0),
        pendingMemoryCount: Number((pendingMemoryCount.rows[0] as { n?: number } | undefined)?.n || 0),
      };
    }

    return NextResponse.json({
      plans: plans.rows,
      steps: steps.rows,
      artifacts: artifacts.rows,
      meta: meta.rows[0] || null,
      promotions: promotions.rows,
      activity: activity.rows,
      graphEvents: graphEvents.rows,
      graphDecisions: graphDecisions.rows,
      graphObservations: graphObservations.rows,
      graphProposals: graphProposals.rows,
      continuity,
    });
  } catch (err) {
    console.error("[channels/thread-extras] GET failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
