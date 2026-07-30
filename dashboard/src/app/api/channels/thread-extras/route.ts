import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId")?.trim();
  if (!threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  try {
    const [plans, steps, artifacts, meta, promotions, activity, interactions, workflowEvents] = await Promise.all([
      pool.query(
        `SELECT id, thread_id, title, status, sort_order, created_at, updated_at, stage_id
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
        `SELECT id, thread_id, title, kind, content, version, created_at, stage_id
           FROM thread_artifacts
          WHERE thread_id = $1
          ORDER BY created_at ASC`,
        [threadId],
      ),
      pool.query(
        `SELECT thread_id, channel_id, lifecycle, state, enabled_workflows,
                research_mode, priority, assignee, repo_id, labels,
                promoted_to, archived_at, updated_at,
                template_version, stage_started_at
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
        `SELECT id, thread_id, stage_id, role, kind, content, payload, status, created_at
           FROM thread_stage_interactions
          WHERE thread_id = $1
          ORDER BY created_at ASC`,
        [threadId],
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT id, thread_id, channel_id, template_id, template_version,
                event_type, from_state, to_state, actor, payload, created_at
           FROM thread_workflow_events
          WHERE thread_id = $1
          ORDER BY created_at ASC
          LIMIT 200`,
        [threadId],
      ).catch(() => ({ rows: [] })),
    ]);

    return NextResponse.json({
      plans: plans.rows,
      steps: steps.rows,
      artifacts: artifacts.rows,
      meta: meta.rows[0] || null,
      promotions: promotions.rows,
      activity: activity.rows,
      interactions: interactions.rows,
      workflowEvents: workflowEvents.rows,
    });
  } catch (err) {
    console.error("[channels/thread-extras] GET failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
