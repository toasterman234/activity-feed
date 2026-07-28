import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../_db";
import { resolveThreadStageModule } from "@/app/channels/workflowRuntime";
import { resolveChannelCwd, resolveRepoCwd, transitionThreadState } from "@/app/channels/transitionThread";
import { piInvocationForHandle } from "@/lib/mentions";
import {
  collectProjectGrounding,
  evaluatePlanApproval,
  renderProjectGrounding,
} from "@/lib/plan-review-guard";
import { pruneThreadActivity, runAgentPrompt, upsertActivityEvent } from "@/lib/runAgentPrompt";
import { writeGraphEvent } from "@/lib/graph-initiatives";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.object({
    issue: z.string().min(1),
    impact: z.string().min(1),
    recommendation: z.string().min(1),
  })).default([]),
  decisionsNeeded: z.array(z.string()).default([]),
  grounding: z.object({
    evidence: z.array(z.string()).default([]),
    unverifiedAssumptions: z.array(z.string()).default([]),
  }).default({ evidence: [], unverifiedAssumptions: [] }),
  revisedPlan: z.array(z.string()).min(1),
});

async function insertInteraction(opts: {
  threadId: string;
  stageId: string;
  role: "user" | "agent" | "system";
  kind: string;
  content: string;
  payload?: Record<string, unknown>;
  status?: string;
}) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO thread_stage_interactions
       (id, thread_id, stage_id, role, kind, content, payload, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id, opts.threadId, opts.stageId, opts.role, opts.kind, opts.content,
      JSON.stringify(opts.payload || {}), opts.status || "active", new Date().toISOString(),
    ],
  );
  return id;
}

function renderReview(title: string, review: z.infer<typeof reviewSchema>) {
  return [
    `# ${title}`,
    "",
    "## Summary",
    review.summary,
    "",
    "## Strengths",
    ...(review.strengths.length ? review.strengths.map((item) => `- ${item}`) : ["- None recorded"]),
    "",
    "## Risks and corrections",
    ...review.risks.flatMap((risk) => [
      `### ${risk.issue}`,
      `Impact: ${risk.impact}`,
      `Recommendation: ${risk.recommendation}`,
      "",
    ]),
    "## Decisions needed",
    ...(review.decisionsNeeded.length ? review.decisionsNeeded.map((item) => `- ${item}`) : ["- None"]),
    "",
    "## Grounding",
    ...(review.grounding.evidence.length
      ? review.grounding.evidence.map((item) => `- Evidence: ${item}`)
      : ["- Evidence: None recorded"]),
    ...(review.grounding.unverifiedAssumptions.length
      ? review.grounding.unverifiedAssumptions.map((item) => `- Unverified assumption: ${item}`)
      : ["- Unverified assumptions: None"]),
    "",
    "## Recommended next steps",
    ...review.revisedPlan.map((item, index) => `${index + 1}. ${item}`),
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { threadId, channelId, action, feedback } = body as {
    threadId?: string;
    channelId?: string;
    action?: "run" | "feedback" | "approve" | "revise";
    feedback?: string;
  };
  if (!threadId || !channelId || !action) {
    return NextResponse.json({ error: "threadId, channelId, and action required" }, { status: 400 });
  }
  const context = await resolveThreadStageModule(pool, {
    threadId,
    channelId,
    type: "guided-review",
  });
  if (!context) {
    return NextResponse.json({ error: "Guided review is not configured for the current stage" }, { status: 409 });
  }
  const config = context.module.config || {};

  const latest = await pool.query(
    `SELECT id, payload, status
       FROM thread_stage_interactions
      WHERE thread_id = $1 AND stage_id = $2 AND kind = 'review.proposal'
      ORDER BY created_at DESC LIMIT 1`,
    [threadId, context.state],
  );

  if (action === "approve") {
    if (!latest.rows[0]) return NextResponse.json({ error: "Run the challenge before approving" }, { status: 409 });
    if (latest.rows[0].status === "approved") {
      const transition = await transitionThreadState({
        threadId, channelId, toState: String(config.approveTo || ""), actor: "you (approved review)", announce: true,
      });
      return NextResponse.json(transition, { status: transition.ok ? 200 : transition.status });
    }
    const review = reviewSchema.parse(JSON.parse(String(latest.rows[0].payload || "{}")).review);
    if (String(config.reviewKind || "plan") === "plan") {
      const approval = evaluatePlanApproval({
        decisionsNeeded: review.decisionsNeeded,
        groundingEvidence: review.grounding.evidence,
        unverifiedAssumptions: review.grounding.unverifiedAssumptions,
      });
      if (!approval.ok) {
        return NextResponse.json({ error: approval.error }, { status: 409 });
      }
    }
    const now = new Date().toISOString();
    const title = String(config.artifactTitle || "Reviewed output");
    await pool.query(
      `UPDATE thread_stage_interactions SET status = 'approved' WHERE id = $1`,
      [latest.rows[0].id],
    );
    await insertInteraction({
      threadId, stageId: context.state, role: "user", kind: "stage.approval",
      content: `${title} approved`, payload: { review }, status: "approved",
    });
    const version = await pool.query(
      `SELECT COALESCE(MAX(version), 0)::int AS version
         FROM thread_artifacts WHERE thread_id = $1 AND title = $2`,
      [threadId, title],
    );
    await pool.query(
      `INSERT INTO thread_artifacts
         (id, thread_id, title, kind, content, version, stage_id, created_at)
       VALUES ($1, $2, $3, 'markdown', $4, $5, $6, $7)`,
      [randomUUID(), threadId, title, renderReview(title, review), Number(version.rows[0]?.version || 0) + 1, context.state, now],
    );
    const transition = await transitionThreadState({
      threadId, channelId, toState: String(config.approveTo || ""), actor: "you (approved plan)", announce: true,
    });
    return NextResponse.json(transition);
  }

  if (action === "revise") {
    const activeReview = latest.rows[0]
      ? reviewSchema.safeParse(JSON.parse(String(latest.rows[0].payload || "{}")).review)
      : null;
    if (!activeReview?.success) {
      return NextResponse.json({ error: "Run the challenge before applying its revised plan" }, { status: 409 });
    }
    if (String(config.reviewKind || "plan") !== "plan") {
      const transition = await transitionThreadState({
        threadId, channelId, toState: String(config.reviseTo || ""), actor: "you (requested revision)", announce: true,
      });
      if (!transition.ok) return NextResponse.json(transition, { status: transition.status });
      await pool.query(
        `UPDATE thread_stage_interactions SET status = 'superseded'
          WHERE thread_id = $1 AND stage_id = $2 AND kind = 'review.proposal' AND status = 'active'`,
        [threadId, context.state],
      );
      await insertInteraction({
        threadId, stageId: context.state, role: "user", kind: "review.revision_requested",
        content: String(feedback || "Revise the work using the review findings."),
      });
      return NextResponse.json(transition);
    }
    {
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        await db.query(`DELETE FROM thread_plans WHERE thread_id = $1`, [threadId]);
        for (const [index, title] of activeReview.data.revisedPlan.entries()) {
          await db.query(
            `INSERT INTO thread_plans
               (id, thread_id, title, status, sort_order, stage_id, acceptance_criteria, dependencies, created_at, updated_at)
             VALUES ($1, $2, $3, 'todo', $4, $5, '[]', '[]', now(), now())`,
            [randomUUID(), threadId, title, index, context.state],
          );
        }
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      } finally {
        db.release();
      }
    }
    await insertInteraction({
      threadId, stageId: context.state, role: "user", kind: "review.revision_applied",
      content: String(feedback || "Applied the challenge's consolidated plan."),
      payload: { proposalId: latest.rows[0].id },
      status: "applied",
    });
    return NextResponse.json({ ok: true, applied: true });
  }

  const trimmedFeedback = String(feedback || "").trim();
  if (action === "feedback" && !trimmedFeedback) {
    return NextResponse.json({ error: "Feedback required" }, { status: 400 });
  }
  if (trimmedFeedback) {
    await insertInteraction({
      threadId, stageId: context.state, role: "user", kind: "review.feedback", content: trimmedFeedback,
    });
  }

  const [conversation, plans, artifacts, interactionHistory] = await Promise.all([
    pool.query(`SELECT author, body FROM messages WHERE id = $1 OR thread_id = $1 ORDER BY created_at`, [threadId]),
    pool.query(`SELECT title, status FROM thread_plans WHERE thread_id = $1 ORDER BY sort_order, created_at`, [threadId]),
    pool.query(`SELECT title, kind, left(content, 3000) AS content FROM thread_artifacts WHERE thread_id = $1 ORDER BY created_at`, [threadId]),
    pool.query(
      `SELECT role, kind, content FROM thread_stage_interactions
        WHERE thread_id = $1 AND stage_id = $2 ORDER BY created_at`,
      [threadId, context.state],
    ),
  ]);
  const reviewKind = String(config.reviewKind || "plan");
  const repoCwd = await resolveRepoCwd(threadId);
  const cwd = repoCwd && existsSync(repoCwd) ? repoCwd : await resolveChannelCwd(channelId);
  const projectGrounding = reviewKind === "plan"
    ? renderProjectGrounding(await collectProjectGrounding(cwd))
    : "";
  const reviewInstruction = reviewKind === "research"
    ? "Verify the evidence and synthesis. Identify unsupported claims, missing or weak citations, unresolved uncertainty, and the corrections needed for a publishable brief."
    : reviewKind === "code"
      ? "Review the proposed change for completeness, regressions, missing tests, operational risk, and evidence that it is ready to ship."
      : reviewKind === "issue"
        ? "Verify that the reported problem is actually resolved, that the evidence covers the original behavior, and that regression and operational risks are addressed."
        : "Challenge the plan. Deduplicate overlapping tasks, identify missing decisions and dependencies, and produce one ordered execution plan.";
  const prompt = [
    "Conversation:",
    ...conversation.rows.map((row) => `${row.author}: ${row.body}`),
    "",
    `Existing tasks (${plans.rows.length}):`,
    ...plans.rows.map((row, index) => `${index + 1}. [${row.status}] ${row.title}`),
    "",
    `Existing artifacts (${artifacts.rows.length}):`,
    ...artifacts.rows.map((row) => `### ${row.title} (${row.kind})\n${row.content}`),
    "",
    "Review discussion:",
    ...interactionHistory.rows.map((row) => `${row.role} (${row.kind}): ${row.content}`),
    "",
    ...(projectGrounding ? [projectGrounding, ""] : []),
    reviewInstruction,
  ].join("\n");
  const systemPrompt = `You run a rigorous but practical ${reviewKind} review.
Return ONLY JSON matching:
{"summary":"...","strengths":["..."],"risks":[{"issue":"...","impact":"...","recommendation":"..."}],"decisionsNeeded":["..."],"grounding":{"evidence":["verified fact and source"],"unverifiedAssumptions":["claim that still needs confirmation"]},"revisedPlan":["ordered action..."]}
The recommended next steps must be concise, evidence-aware, and ready for action.
Never invent frameworks, databases, entities, integrations, or user models. Treat phrases such as "see above" as missing context unless that context is present in the supplied conversation. Use the server-generated project grounding as authoritative. If the target system or a material architecture choice is unknown, record it in decisionsNeeded or unverifiedAssumptions instead of guessing. A plan with either list non-empty cannot be approved.`;
  const { provider, model } = piInvocationForHandle("pi");
  const runId = randomUUID();
  const liveActivity = process.env.CHANNEL_LIVE_ACTIVITY === "1";
  let seq = 0;
  const subjectLabel = String(config.subject || reviewKind || "review");
  const markActivity = async (label: string, status: string, detail?: string, kind = "status") => {
    if (!liveActivity) return;
    seq += 1;
    await upsertActivityEvent({
      id: `${runId}:${seq}`,
      threadId,
      runId,
      seq,
      kind,
      label,
      detail,
      status,
    }).catch((e) => console.error("[stage-review] activity upsert failed:", (e as Error).message));
  };

  if (liveActivity) {
    await pruneThreadActivity(threadId).catch(() => {});
  }
  await markActivity(`Reviewing ${subjectLabel}…`, "running", "Starting agent review");
  await writeGraphEvent({
    channelId,
    threadId,
    kind: "agent.review.started",
    actor: "pi",
    payload: { reviewKind, subject: subjectLabel, action, runId, stageId: context.state },
  }).catch((e) => console.error("[stage-review] graph start failed:", (e as Error).message));

  let outcome;
  try {
    await markActivity("Agent is working…", "running", `${provider}/${model}`);
    outcome = await runAgentPrompt({
      prompt, systemPrompt, piBin: process.env.CHANNEL_PI_BIN || "pi",
      provider, model, cwd, threadId, liveActivity,
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    await markActivity("Review interrupted", "error", detail.slice(0, 500));
    await insertInteraction({
      threadId,
      stageId: context.state,
      role: "system",
      kind: "review.error",
      content: "The review was interrupted before it produced a result.",
      payload: { detail: detail.slice(0, 500), runId },
      status: "error",
    });
    await writeGraphEvent({
      channelId,
      threadId,
      kind: "agent.review.failed",
      actor: "pi",
      payload: { reviewKind, subject: subjectLabel, runId, detail: detail.slice(0, 500) },
    }).catch(() => {});
    return NextResponse.json(
      { error: "The review was interrupted before it finished. Your task is unchanged; retry the review." },
      { status: 503 },
    );
  }
  const parsed = reviewSchema.safeParse(outcome.parsed);
  if (!parsed.success) {
    await markActivity("Review returned invalid output", "error", (outcome.stdout || "").slice(0, 400));
    await insertInteraction({
      threadId,
      stageId: context.state,
      role: "system",
      kind: "review.error",
      content: "The agent returned an invalid review payload.",
      payload: { runId, stdout: (outcome.stdout || "").slice(0, 500) },
      status: "error",
    });
    await writeGraphEvent({
      channelId,
      threadId,
      kind: "agent.review.failed",
      actor: "pi",
      payload: { reviewKind, subject: subjectLabel, runId, reason: "invalid_payload" },
    }).catch(() => {});
    return NextResponse.json({ error: "Agent returned an invalid plan challenge" }, { status: 502 });
  }
  await pool.query(
    `UPDATE thread_stage_interactions
        SET status = 'superseded'
      WHERE thread_id = $1 AND stage_id = $2 AND kind = 'review.proposal' AND status = 'active'`,
    [threadId, context.state],
  );
  await insertInteraction({
    threadId, stageId: context.state, role: "agent", kind: "review.proposal",
    content: parsed.data.summary, payload: { review: parsed.data, runId },
  });
  await markActivity("Review ready", "done", parsed.data.summary.slice(0, 240));
  await writeGraphEvent({
    channelId,
    threadId,
    kind: "agent.review.completed",
    actor: "pi",
    payload: {
      reviewKind,
      subject: subjectLabel,
      runId,
      stageId: context.state,
      summary: parsed.data.summary.slice(0, 500),
      riskCount: parsed.data.risks.length,
      decisionCount: parsed.data.decisionsNeeded.length,
      revisedPlanCount: parsed.data.revisedPlan.length,
    },
  }).catch((e) => console.error("[stage-review] graph complete failed:", (e as Error).message));
  return NextResponse.json({ ok: true, review: parsed.data, runId });
}
