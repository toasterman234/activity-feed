import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";
import { defaultEnabledWorkflows } from "@/app/channels/lifecycles";
import { getWorkflowTemplate } from "@/app/channels/workflowRegistry.server";

export const dynamic = "force-dynamic";

const AUTHORITIES = new Set(["prepare", "implement", "commit", "deploy"]);

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId")?.trim();
  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });
  try {
    const result = await pool.query(
      `SELECT tl.target_thread_id, tm.channel_id, tm.state, tm.assignee, tm.repo_id,
              m.body, tl.created_at
         FROM thread_links tl
         JOIN thread_meta tm ON tm.thread_id = tl.target_thread_id
         LEFT JOIN messages m ON m.id = tl.target_thread_id
        WHERE tl.source_thread_id = $1 AND tl.relation = 'executes'
        ORDER BY tl.created_at DESC`,
      [threadId],
    );
    return NextResponse.json({
      executions: result.rows.map((row) => ({
        ...row,
        title: String(row.body || "Execution task").split("\n")[0],
        url: `/channels/${row.channel_id}/${row.target_thread_id}`,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const threadId = String(body.threadId || "").trim();
  const channelId = String(body.channelId || "").trim();
  const repoId = String(body.repoId || "").trim();
  const action = String(body.action || "").trim();
  const agent = String(body.agent || "pi").trim() || "pi";
  const authority = String(body.authority || "implement").trim();
  if (!threadId || !channelId || !repoId || !["link", "start"].includes(action)) {
    return NextResponse.json({ error: "Choose a project before continuing" }, { status: 400 });
  }
  if (!AUTHORITIES.has(authority)) {
    return NextResponse.json({ error: "Unknown execution authority" }, { status: 400 });
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const [sourceRes, repoRes, planRes, artifactRes] = await Promise.all([
      db.query(
        `SELECT tm.lifecycle, tm.state, tm.repo_id, m.body
           FROM thread_meta tm JOIN messages m ON m.id = tm.thread_id
          WHERE tm.thread_id = $1 AND tm.channel_id = $2 FOR UPDATE`,
        [threadId, channelId],
      ),
      db.query(`SELECT id, name, path, git_remote FROM repos WHERE id = $1`, [repoId]),
      db.query(
        `SELECT title, sort_order, acceptance_criteria, dependencies
           FROM thread_plans WHERE thread_id = $1 ORDER BY sort_order, created_at`,
        [threadId],
      ),
      db.query(
        `SELECT DISTINCT ON (title) title, kind, content, version
           FROM thread_artifacts
          WHERE thread_id = $1
          ORDER BY title, version DESC`,
        [threadId],
      ),
    ]);
    const source = sourceRes.rows[0];
    const repo = repoRes.rows[0];
    if (!source || source.lifecycle !== "planning" || source.state !== "accepted") {
      await db.query("ROLLBACK");
      return NextResponse.json({ error: "Only an approved plan can start execution" }, { status: 409 });
    }
    if (!repo) {
      await db.query("ROLLBACK");
      return NextResponse.json({ error: "Project or repository not found" }, { status: 404 });
    }
    if (!planRes.rows.length) {
      await db.query("ROLLBACK");
      return NextResponse.json({ error: "The approved plan has no tasks" }, { status: 409 });
    }
    if (action === "start" && !existsSync(String(repo.path))) {
      await db.query("ROLLBACK");
      return NextResponse.json({ error: "This repository is not available on the execution host. Link the plan now or register an executable repository path." }, { status: 409 });
    }

    const now = new Date().toISOString();
    await db.query(
      `UPDATE thread_meta SET repo_id = $2, updated_at = $3 WHERE thread_id = $1`,
      [threadId, repoId, now],
    );
    if (action === "link") {
      await db.query(
        `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
         VALUES ($1, $2, $3, 'system', $4, $5)`,
        [randomUUID(), channelId, threadId, `Linked approved plan to project **${repo.name}**.`, now],
      );
      await db.query("COMMIT");
      return NextResponse.json({ ok: true, linked: true, repo });
    }

    const existingExecution = await db.query(
      `SELECT tl.target_thread_id, tm.channel_id, tm.state
         FROM thread_links tl
         JOIN thread_meta tm ON tm.thread_id = tl.target_thread_id
        WHERE tl.source_thread_id = $1
          AND tl.relation = 'executes'
          AND tm.archived_at IS NULL
          AND tm.state NOT IN ('accepted', 'rejected', 'stopped', 'closed', 'wont_fix')
        ORDER BY tl.created_at DESC
        LIMIT 1`,
      [threadId],
    );
    if (existingExecution.rows[0]) {
      await db.query("ROLLBACK");
      const existing = existingExecution.rows[0];
      return NextResponse.json({
        ok: true,
        existing: true,
        executionThreadId: existing.target_thread_id,
        channelId: existing.channel_id,
        url: `/channels/${existing.channel_id}/${existing.target_thread_id}`,
      });
    }

    const templateRecord = await getWorkflowTemplate(db, "coding");
    if (!templateRecord) throw new Error("Coding workflow is unavailable");
    const template = templateRecord.definition;
    const executionThreadId = randomUUID();
    const sourceTitle = String(source.body || "Approved plan").split("\n")[0].slice(0, 160);
    const authorityLabel = {
      prepare: "Prepare changes for review; do not commit or deploy.",
      implement: "Implement and verify; do not commit or deploy.",
      commit: "Implement, verify, and commit explicit changed paths; do not deploy.",
      deploy: "Implement, verify, commit explicit changed paths, and deploy when the workflow reaches its deployment gate.",
    }[authority as "prepare" | "implement" | "commit" | "deploy"];
    const reviewArtifact = artifactRes.rows.find((artifact) =>
      String(artifact.title).toLowerCase().includes("reviewed plan")
    );
    const rootBody = [
      `Execute approved plan: ${sourceTitle}`,
      "",
      `Target project: ${repo.name}`,
      `Repository: ${repo.path}${repo.git_remote ? ` (${repo.git_remote})` : ""}`,
      `Assigned agent: @${agent}`,
      `Authority: ${authorityLabel}`,
      `Source plan: ${threadId}`,
      "",
      "Approved execution plan:",
      ...planRes.rows.map((task, index) => `${index + 1}. ${task.title}`),
      ...(reviewArtifact
        ? ["", "Approved review context:", String(reviewArtifact.content).slice(0, 5000)]
        : []),
      "",
      "Work through these tasks in order. Record blockers and verification evidence in this execution task.",
    ].join("\n");
    await db.query(
      `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
       VALUES ($1, $2, NULL, 'you', $3, $4)`,
      [executionThreadId, channelId, rootBody, now],
    );
    await db.query(
      `INSERT INTO thread_meta (
         thread_id, channel_id, lifecycle, state, enabled_workflows, template_version,
         template_snapshot, stage_started_at, created_at, priority, assignee, repo_id, labels, updated_at
       ) VALUES ($1, $2, 'coding', $3, $4, $5, $6, $7, $7, 'normal', $8, $9, $10, $7)`,
      [
        executionThreadId, channelId, template.initial,
        JSON.stringify(defaultEnabledWorkflows("coding")), template.version,
        JSON.stringify(template), now, agent, repoId,
        JSON.stringify(["execution", `source-plan:${threadId}`]),
      ],
    );
    for (const [index, task] of planRes.rows.entries()) {
      await db.query(
        `INSERT INTO thread_plans (
           id, thread_id, title, status, sort_order, stage_id, acceptance_criteria,
           dependencies, assignee, created_at, updated_at
         ) VALUES ($1, $2, $3, 'todo', $4, $5, $6, $7, $8, $9, $9)`,
        [
          randomUUID(), executionThreadId, task.title, index, template.initial,
          task.acceptance_criteria || "[]", task.dependencies || "[]", agent, now,
        ],
      );
    }
    for (const artifact of artifactRes.rows) {
      await db.query(
        `INSERT INTO thread_artifacts (
           id, thread_id, title, kind, content, version, stage_id, created_at
         ) VALUES ($1, $2, $3, $4, $5, 1, $6, $7)`,
        [
          randomUUID(), executionThreadId, `Source plan · ${artifact.title}`,
          artifact.kind, artifact.content, template.initial, now,
        ],
      );
    }
    await db.query(
      `INSERT INTO thread_links (id, source_thread_id, target_thread_id, relation, created_at)
       VALUES ($1, $2, $3, 'executes', $4)`,
      [randomUUID(), threadId, executionThreadId, now],
    );
    await db.query(
      `INSERT INTO thread_workflow_events (
         id, thread_id, channel_id, template_id, template_version, event_type,
         from_state, to_state, actor, payload, created_at
       ) VALUES ($1, $2, $3, 'coding', $4, 'workflow.created', NULL, $5, 'execution handoff', $6, $7)`,
      [
        randomUUID(), executionThreadId, channelId, template.version, template.initial,
        JSON.stringify({ sourcePlanThreadId: threadId, repoId, agent, authority }), now,
      ],
    );
    await db.query(
      `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
       VALUES ($1, $2, $3, 'system', $4, $5)`,
      [
        randomUUID(), channelId, threadId,
        `Created linked execution task for **${repo.name}** with @${agent}.`,
        now,
      ],
    );
    await db.query("COMMIT");
    return NextResponse.json({
      ok: true,
      executionThreadId,
      channelId,
      url: `/channels/${channelId}/${executionThreadId}`,
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("[channels/execution-handoff] failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    db.release();
  }
}
