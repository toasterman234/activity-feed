import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool } from "../../_db";
import { piInvocationForHandle } from "@/lib/mentions";
import { runAgentPrompt } from "@/lib/runAgentPrompt";
import { resolveChannelCwd, resolveRepoCwd } from "@/app/channels/transitionThread";
import { existsSync } from "fs";
import { resolveThreadStageModule } from "@/app/channels/workflowRuntime";

export const dynamic = "force-dynamic";

const frameResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("needs_input"),
    question: z.string().min(1),
    reason: z.string().optional(),
  }),
  z.object({
    status: z.literal("ready"),
    frame: z.object({
      primaryQuestion: z.string().min(1),
      decision: z.string().default("General understanding"),
      scope: z.array(z.string()).default([]),
      subquestions: z.array(z.string()).min(1),
      successCriteria: z.array(z.string()).min(1),
    }),
  }),
]);

async function insertInteraction(opts: {
  threadId: string;
  role: "user" | "agent" | "system";
  kind: string;
  content: string;
  payload?: Record<string, unknown>;
  status?: string;
  stageId: string;
}, db: Pick<PoolClient, "query"> = pool) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO thread_stage_interactions
       (id, thread_id, stage_id, role, kind, content, payload, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      opts.threadId,
      opts.stageId,
      opts.role,
      opts.kind,
      opts.content,
      JSON.stringify(opts.payload || {}),
      opts.status || "active",
      new Date().toISOString(),
    ],
  );
  return id;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { threadId, channelId, action, answer } = body as {
    threadId?: string;
    channelId?: string;
    action?: "respond" | "assume" | "approve";
    answer?: string;
  };
  if (!threadId || !channelId || !action) {
    return NextResponse.json({ error: "threadId, channelId, and action required" }, { status: 400 });
  }

  const context = await resolveThreadStageModule(pool, {
    threadId,
    channelId,
    type: "guided-interview",
  });
  if (!context) {
    return NextResponse.json({ error: "Guided interview is not configured for the current stage" }, { status: 409 });
  }
  const stageId = context.state;

  if (action === "approve") {
    const ready = await pool.query(
      `SELECT id, payload
         FROM thread_stage_interactions
        WHERE thread_id = $1 AND stage_id = $2 AND kind = 'frame.proposal'
        ORDER BY created_at DESC
        LIMIT 1`,
      [threadId, stageId],
    );
    if (!ready.rows[0]) {
      return NextResponse.json({ error: "No proposed frame to approve" }, { status: 409 });
    }
    const payload = JSON.parse(String(ready.rows[0].payload || "{}"));
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        `UPDATE thread_stage_interactions SET status = 'approved' WHERE id = $1`,
        [ready.rows[0].id],
      );
      await insertInteraction({
        threadId,
        stageId,
        role: "user",
        kind: "frame.approval",
        content: "Research frame approved",
        payload,
        status: "approved",
      }, db);
      const existing = await db.query(
        `SELECT COALESCE(MAX(version), 0)::int AS version
           FROM thread_artifacts
          WHERE thread_id = $1 AND title = 'Research frame'`,
        [threadId],
      );
      await db.query(
        `INSERT INTO thread_artifacts
           (id, thread_id, title, kind, content, version, stage_id, created_at)
         VALUES ($1, $2, 'Research frame', 'markdown', $3, $4, $5, $6)`,
        [
          randomUUID(),
          threadId,
          renderFrameMarkdown(payload.frame),
          Number(existing.rows[0]?.version || 0) + 1,
          stageId,
          new Date().toISOString(),
        ],
      );
      await db.query("COMMIT");
      return NextResponse.json({ ok: true, approved: true, frame: payload.frame });
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }

  const trimmedAnswer = String(answer || "").trim();
  if (action === "respond" && !trimmedAnswer) {
    return NextResponse.json({ error: "Answer required" }, { status: 400 });
  }
  await insertInteraction({
    threadId,
    stageId,
    role: "user",
    kind: action === "assume" ? "frame.assumption_request" : "frame.answer",
    content: action === "assume" ? "Use reasonable assumptions and propose the frame." : trimmedAnswer,
  });

  const [rootRes, interactionRes] = await Promise.all([
    pool.query(`SELECT body FROM messages WHERE id = $1 LIMIT 1`, [threadId]),
    pool.query(
      `SELECT role, kind, content, payload
         FROM thread_stage_interactions
        WHERE thread_id = $1 AND stage_id = $2
        ORDER BY created_at ASC`,
      [threadId, stageId],
    ),
  ]);
  const history = interactionRes.rows
    .map((row) => `${row.role}: ${row.content}`)
    .join("\n");
  const systemPrompt = `You facilitate the Frame stage of a personal research workflow.
Return ONLY JSON. Ask at most one follow-up question at a time.
Only ask when the missing answer would materially change the research scope, evidence, or safety.
If the question is clear enough, make reasonable assumptions and return a proposed frame.
Allowed responses:
{"status":"needs_input","question":"one focused question","reason":"brief reason"}
{"status":"ready","frame":{"primaryQuestion":"...","decision":"...","scope":["..."],"subquestions":["..."],"successCriteria":["..."]}}`;
  const prompt = [
    `Original thread title/context: ${rootRes.rows[0]?.body || "(none)"}`,
    "",
    "Frame-stage interaction history:",
    history,
    "",
    action === "assume"
      ? "Do not ask another question. Use reasonable assumptions and propose the frame."
      : "Decide whether one material follow-up is necessary. Otherwise propose the frame.",
  ].join("\n");

  const repoCwd = await resolveRepoCwd(threadId);
  const cwd = repoCwd && existsSync(repoCwd) ? repoCwd : await resolveChannelCwd(channelId);
  const { provider, model } = piInvocationForHandle("pi");
  const outcome = await runAgentPrompt({
    prompt,
    systemPrompt,
    piBin: process.env.CHANNEL_PI_BIN || "pi",
    provider,
    model,
    cwd,
    threadId,
  });
  const parsed = frameResultSchema.safeParse(outcome.parsed);
  if (!parsed.success) {
    return NextResponse.json({ error: "Agent returned an invalid framing response" }, { status: 502 });
  }
  const result = parsed.data;
  await insertInteraction({
    threadId,
    stageId,
    role: "agent",
    kind: result.status === "ready" ? "frame.proposal" : "frame.question",
    content: result.status === "ready" ? result.frame.primaryQuestion : result.question,
    payload: result,
  });
  return NextResponse.json({ ok: true, result });
}

function renderFrameMarkdown(frame: {
  primaryQuestion: string;
  decision: string;
  scope: string[];
  subquestions: string[];
  successCriteria: string[];
}) {
  return [
    "# Research frame",
    "",
    "## Primary question",
    frame.primaryQuestion,
    "",
    "## Decision supported",
    frame.decision,
    "",
    "## Scope",
    ...frame.scope.map((item) => `- ${item}`),
    "",
    "## Subquestions",
    ...frame.subquestions.map((item) => `- ${item}`),
    "",
    "## Success criteria",
    ...frame.successCriteria.map((item) => `- ${item}`),
  ].join("\n");
}
