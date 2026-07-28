import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { pool } from "@/app/api/_db";
import { LIFECYCLES, type Lifecycle } from "@/app/channels/lifecycles";
import { evaluateStageExitGates } from "@/app/channels/workflowRuntime";
import { recordWorkflowEvent } from "@/lib/workflowEvents";
import { runThreadVerification } from "@/lib/verification-profiles";
import { emitLifecycleTransitionEvent } from "@/lib/graph-initiatives";

const execFileAsync = promisify(execFile);

export type TransitionResult =
  | {
      ok: true;
      from: string;
      to: string;
      requested: string;
      gated: boolean;
      ranCommands: string[];
    }
  | {
      ok: false;
      error: string;
      status: number;
      from?: string;
      to?: string;
      detail?: string;
    };

async function insertMessage(row: {
  id: string;
  channel_id: string;
  thread_id: string | null;
  author: string;
  body: string;
  created_at: string;
}) {
  await pool.query(
    `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [row.id, row.channel_id, row.thread_id, row.author, row.body, row.created_at],
  );
}

async function upsertWorkflowStep(row: {
  id: string;
  threadId: string;
  label: string;
  status: string;
  detail?: string;
}) {
  await pool.query(
    `INSERT INTO thread_workflow_steps (id, thread_id, step_label, status, detail, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET status = $4, detail = $5`,
    [row.id, row.threadId, row.label, row.status, row.detail || "", new Date().toISOString()],
  );
}

async function writeArtifact(threadId: string, artifact: { title: string; kind: string; content: string }) {
  const existing = await pool.query(
    `SELECT COALESCE(MAX(version), 0) AS v FROM thread_artifacts WHERE thread_id = $1 AND title = $2`,
    [threadId, artifact.title],
  );
  const nextVersion = (Number(existing.rows[0]?.v) || 0) + 1;
  await pool.query(
    `INSERT INTO thread_artifacts (id, thread_id, title, kind, content, version, stage_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, (SELECT state FROM thread_meta WHERE thread_id = $2), $7)`,
    [randomUUID(), threadId, artifact.title, artifact.kind, artifact.content, nextVersion, new Date().toISOString()],
  );
}

export async function resolveRepoCwd(threadId: string): Promise<string | null> {
  try {
    const res = await pool.query(
      `SELECT r.path
         FROM thread_meta tm
         JOIN repos r ON r.id = tm.repo_id
        WHERE tm.thread_id = $1`,
      [threadId],
    );
    return (res.rows[0]?.path as string) || null;
  } catch {
    return null;
  }
}

export async function resolveChannelCwd(channelId: string): Promise<string> {
  const root =
    process.env.CHANNEL_AGENT_CWD ||
    (process.platform === "darwin"
      ? "/Users/bencharney/activity-feed"
      : "/home/ubuntu/activity-feed");
  try {
    const res = await pool.query(
      `SELECT member_name FROM channel_members
       WHERE channel_id = $1 AND member_type = 'project'
       ORDER BY created_at ASC LIMIT 1`,
      [channelId],
    );
    const project = res.rows[0]?.member_name as string | undefined;
    if (!project) return root;
    if (process.env.CHANNEL_AGENT_CWD) return root;
    const map: Record<string, string> = {
      "activity-feed": "/Users/bencharney/activity-feed",
      "ax-brain-crew": "/Users/bencharney/ax-brain-crew",
      "ben-workspace": "/Users/bencharney/ben-workspace",
    };
    return map[project] || root;
  } catch {
    return root;
  }
}

async function resolveTransitionCwd(channelId: string, threadId: string): Promise<string> {
  const repoCwd = await resolveRepoCwd(threadId);
  if (repoCwd && existsSync(repoCwd)) return repoCwd;
  return resolveChannelCwd(channelId);
}

/**
 * Advance a thread's lifecycle state. Runs enabled command workflows for the
 * target state (same as @mention nextState). Gating failures block the advance
 * (coding: override to `failed` when that state exists).
 */
export async function transitionThreadState(opts: {
  threadId: string;
  channelId: string;
  toState: string;
  actor?: string;
  /** When false, skip the system chat line (agent path already posts a reply). Default true. */
  announce?: boolean;
}): Promise<TransitionResult> {
  const actor = opts.actor || "you";
  const announce = opts.announce !== false;

  const metaRes = await pool.query(
    `SELECT lifecycle, state, enabled_workflows, archived_at, channel_id, template_snapshot
       FROM thread_meta WHERE thread_id = $1`,
    [opts.threadId],
  );
  const meta = metaRes.rows[0] as
    | {
        lifecycle: string;
        state: string;
        enabled_workflows: string;
        archived_at: string | null;
        channel_id: string;
        template_snapshot: string | null;
      }
    | undefined;

  if (!meta) {
    return { ok: false, error: "thread has no lifecycle yet", status: 404 };
  }
  if (meta.archived_at) {
    return { ok: false, error: "thread is archived", status: 409 };
  }
  if (meta.channel_id !== opts.channelId) {
    return {
      ok: false,
      error: "channel mismatch — thread lives elsewhere",
      status: 409,
      detail: meta.channel_id,
    };
  }

  const lifecycleKey = meta.lifecycle;
  const lc = meta.template_snapshot
    ? JSON.parse(meta.template_snapshot) as Lifecycle
    : LIFECYCLES[lifecycleKey];
  if (!lc) {
    return { ok: false, error: `unknown lifecycle: ${lifecycleKey}`, status: 400 };
  }

  const from = meta.state;
  const requested = opts.toState;
  if (from === requested) {
    return { ok: true, from, to: from, requested, gated: false, ranCommands: [] };
  }
  if (!(lc.transitions[from]?.includes(requested) ?? false)) {
    return {
      ok: false,
      error: "illegal transition",
      status: 409,
      from,
      to: requested,
    };
  }
  const readiness = await evaluateStageExitGates(pool, {
    threadId: opts.threadId,
    definition: lc,
    state: from,
    toState: requested,
  });
  if (!readiness.ok) {
    return {
      ok: false,
      error: readiness.failed.map((gate) => gate.message).join(" "),
      status: 409,
      from,
      to: requested,
      detail: readiness.failed.map((gate) => gate.id).join(","),
    };
  }

  let enabledWorkflows: string[] = [];
  try {
    enabledWorkflows = meta.enabled_workflows ? JSON.parse(meta.enabled_workflows) : [];
  } catch {
    enabledWorkflows = [];
  }

  const cwd = await resolveTransitionCwd(opts.channelId, opts.threadId);
  let resolvedState = requested;
  let gated = false;
  const ranCommands: string[] = [];
  let repositoryProfileVerified = false;

  if (lifecycleKey === "issue" && from === "in_progress" && requested === "resolved") {
    const runResult = await pool.query<{ id: string }>(
      `SELECT id
         FROM work_runs
        WHERE thread_id = $1
          AND status IN ('running', 'succeeded')
        ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, created_at DESC
        LIMIT 1`,
      [opts.threadId],
    );
    const runId = runResult.rows[0]?.id;
    if (!runId) {
      return {
        ok: false,
        error: "Run the resolution through an agent attempt before verification.",
        status: 409,
        from,
        to: requested,
        detail: "verification:no-work-run",
      };
    }

    const verification = await runThreadVerification(pool, {
      threadId: opts.threadId,
      runId,
    });
    if (!verification.passed) {
      const output = verification.failedChecks
        .map((check) => `## ${check.label}\n\n${check.output}`)
        .join("\n\n");
      await writeArtifact(opts.threadId, {
        title: "Verification feedback",
        kind: "code",
        content: `${verification.summary}${output ? `\n\n${output}` : ""}`.slice(0, 12000),
      });
      await recordWorkflowEvent({
        threadId: opts.threadId,
        channelId: opts.channelId,
        lifecycle: lifecycleKey,
        eventType: "verification.failed",
        actor,
        fromState: from,
        toState: requested,
        payload: {
          runId,
          configured: verification.configured,
          feedbackCycle: verification.feedbackCycle,
          failedChecks: verification.failedChecks.map(({ key, label }) => ({ key, label })),
        },
      });
      await insertMessage({
        id: randomUUID(),
        channel_id: opts.channelId,
        thread_id: opts.threadId,
        author: "system",
        body: `⚠️ ${verification.summary} The issue remains in Resolve; the failure output is attached as **Verification feedback**.`,
        created_at: new Date().toISOString(),
      });
      return {
        ok: false,
        error: verification.summary,
        status: 409,
        from,
        to: requested,
        detail: `verification:${verification.feedbackCycle || "not-configured"}`,
      };
    }
    repositoryProfileVerified = verification.configured;
    await recordWorkflowEvent({
      threadId: opts.threadId,
      channelId: opts.channelId,
      lifecycle: lifecycleKey,
      eventType: "verification.passed",
      actor,
      fromState: from,
      toState: requested,
      payload: { runId, summary: verification.summary },
    });
  }

  for (const [wfId, wf] of Object.entries(lc.workflows)) {
    if (!enabledWorkflows.includes(wfId)) continue;
    if (wf.kind !== "command" || wf.runsAt !== requested || !wf.command) continue;
    if (repositoryProfileVerified && lifecycleKey === "issue" && wfId === "verify-fix") continue;

    const cmdStepId = randomUUID();
    ranCommands.push(wfId);
    await upsertWorkflowStep({
      id: cmdStepId,
      threadId: opts.threadId,
      label: `${wf.label} (${wf.command})`,
      status: "running",
    });
    try {
      const { stdout: cmdOut } = await execFileAsync("/bin/bash", ["-lc", wf.command], {
        timeout: 120_000,
        cwd,
        env: process.env,
        maxBuffer: 1 * 1024 * 1024,
      });
      await upsertWorkflowStep({
        id: cmdStepId,
        threadId: opts.threadId,
        label: `${wf.label} (${wf.command})`,
        status: "done",
        detail: (cmdOut || "").slice(0, 200),
      });
    } catch (cmdErr: unknown) {
      const errMsg =
        cmdErr instanceof Error
          ? (cmdErr as Error & { stderr?: string; stdout?: string }).stderr ||
            (cmdErr as Error & { stdout?: string }).stdout ||
            cmdErr.message
          : String(cmdErr);
      await upsertWorkflowStep({
        id: cmdStepId,
        threadId: opts.threadId,
        label: `${wf.label} (${wf.command})`,
        status: "error",
        detail: errMsg.slice(0, 400),
      });
      await writeArtifact(opts.threadId, {
        title: `${wf.label} failure output`,
        kind: "code",
        content: errMsg.slice(0, 4000),
      });
      if (wf.gates) {
        gated = true;
        resolvedState = lc.states.failed ? "failed" : from;
        await recordWorkflowEvent({
          threadId: opts.threadId,
          channelId: opts.channelId,
          lifecycle: lifecycleKey,
          eventType: "stage.gate_failed",
          actor,
          fromState: from,
          toState: requested,
          payload: { workflowId: wfId, workflowLabel: wf.label, error: errMsg.slice(0, 1000) },
        });
        await insertMessage({
          id: randomUUID(),
          channel_id: opts.channelId,
          thread_id: opts.threadId,
          author: "system",
          body: `⚠️ Gating workflow **${wf.label}** failed — transition blocked.`,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  // If gating blocked and we stayed on `from`, don't rewrite state / announce success.
  if (gated && resolvedState === from) {
    return {
      ok: false,
      error: "gated workflow failed — transition blocked",
      status: 409,
      from,
      to: requested,
      detail: ranCommands.join(","),
    };
  }

  const transitionedAt = new Date().toISOString();
  await pool.query(
    `UPDATE thread_meta
        SET state = $1, stage_started_at = $2, updated_at = $2
      WHERE thread_id = $3`,
    [resolvedState, transitionedAt, opts.threadId],
  );
  await recordWorkflowEvent({
    threadId: opts.threadId,
    channelId: opts.channelId,
    lifecycle: lifecycleKey,
    eventType: "stage.transitioned",
    actor,
    fromState: from,
    toState: resolvedState,
    payload: { requested, gated, ranCommands },
    createdAt: transitionedAt,
  });
  if (lc.states[resolvedState]?.terminal) {
    await recordWorkflowEvent({
      threadId: opts.threadId,
      channelId: opts.channelId,
      lifecycle: lifecycleKey,
      eventType: "workflow.completed",
      actor,
      fromState: from,
      toState: resolvedState,
      payload: { requested },
      createdAt: transitionedAt,
    });
  }

  if (announce) {
    const fromLabel = lc.states[from]?.label || from;
    const toLabel = lc.states[resolvedState]?.label || resolvedState;
    await insertMessage({
      id: randomUUID(),
      channel_id: opts.channelId,
      thread_id: opts.threadId,
      author: "system",
      body: `State: ${fromLabel} → ${toLabel} (${actor})`,
      created_at: new Date().toISOString(),
    });
  }

  await emitLifecycleTransitionEvent({
    channelId: opts.channelId,
    threadId: opts.threadId,
    actor,
    from,
    to: resolvedState,
    lifecycle: lifecycleKey,
    gated,
  }).catch((error) => {
    console.error("[transition] graph lifecycle event failed:", (error as Error).message);
  });

  return {
    ok: true,
    from,
    to: resolvedState,
    requested,
    gated,
    ranCommands,
  };
}
