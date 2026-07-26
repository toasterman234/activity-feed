import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { pool } from "@/app/api/_db";
import { execFileNoStdin } from "@/lib/execFileNoStdin";

const execFileAsync = promisify(execFile);

// ── Live-activity helpers (shared with trigger/route.ts) ───────────────────

export interface ActivityEventRow {
  id: string;
  threadId: string;
  runId: string;
  seq: number;
  kind: string;
  label: string;
  detail?: string;
  status?: string;
}

export async function upsertActivityEvent(row: {
  id: string;
  threadId: string;
  runId: string;
  seq: number;
  kind: string;
  label: string;
  detail?: string;
  status?: string;
}) {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO thread_activity_events
       (id, thread_id, run_id, seq, kind, label, detail, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     ON CONFLICT (id) DO UPDATE
       SET label = $6, detail = $7, status = $8, updated_at = $9`,
    [row.id, row.threadId, row.runId, row.seq, row.kind, row.label,
     (row.detail || "").slice(0, 4000), row.status || "running", now],
  );
}

const ACTIVITY_KEEP_RUNS = 3;
export async function pruneThreadActivity(threadId: string) {
  try {
    await pool.query(
      `DELETE FROM thread_activity_events
        WHERE thread_id = $1
          AND run_id NOT IN (
            SELECT run_id FROM (
              SELECT run_id, MAX(created_at) AS mx
                FROM thread_activity_events
               WHERE thread_id = $1
               GROUP BY run_id
               ORDER BY mx DESC
               LIMIT $2
            ) keep
          )`,
      [threadId, ACTIVITY_KEEP_RUNS],
    );
  } catch (e) {
    console.error("[runAgentPrompt] activity prune failed:", (e as Error).message);
  }
}

export async function updateMessageBody(id: string, body: string) {
  await pool.query(`UPDATE messages SET body = $2 WHERE id = $1`, [id, body]);
}

function tail(s: string, max: number): string {
  const t = (s || "").trim();
  return t.length <= max ? t : `…${t.slice(t.length - max)}`;
}

// ── Structured reply ───────────────────────────────────────────────────────

export type StructuredReply = {
  message?: string;
  plan?: string[];
  nextState?: string;
  artifact?: { title: string; kind: string; content: string };
};

export function parseStructuredReply(raw: string): StructuredReply {
  let cleaned = raw.trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) cleaned = fenced[1].trim();
  try {
    return JSON.parse(cleaned || "{}") as StructuredReply;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}\s*$/);
    if (match) return JSON.parse(match[0]) as StructuredReply;
  }
  return {};
}

// ── Shared pi invocation ───────────────────────────────────────────────────

export async function writePlan(threadId: string, items: string[]) {
  const now = new Date().toISOString();
  for (let i = 0; i < items.length; i++) {
    await pool.query(
      `INSERT INTO thread_plans (id, thread_id, title, status, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, 'todo', $4, $5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [randomUUID(), threadId, items[i], i, now],
    );
  }
}

export async function writeArtifact(threadId: string, artifact: { title: string; kind: string; content: string }) {
  const existing = await pool.query(
    `SELECT COALESCE(MAX(version), 0) AS v FROM thread_artifacts WHERE thread_id = $1 AND title = $2`,
    [threadId, artifact.title],
  );
  const nextVersion = (Number(existing.rows[0]?.v) || 0) + 1;
  await pool.query(
    `INSERT INTO thread_artifacts (id, thread_id, title, kind, content, version, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), threadId, artifact.title, artifact.kind, artifact.content, nextVersion, new Date().toISOString()],
  );
}

export async function upsertWorkflowStep(row: {
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

export async function insertMessage(row: {
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

/**
 * One-shot pi invocation (text mode, no tools by default). Returns
 * the parsed structured reply. Does NOT write any messages to the thread —
 * the caller owns presentation and state transitions.
 */
export async function runAgentPrompt(opts: {
  prompt: string;
  systemPrompt?: string;
  piBin: string;
  provider: string;
  model: string;
  cwd: string;
  timeoutMs?: number;
  threadId?: string;
  liveActivity?: boolean;
}): Promise<{
  parsed: StructuredReply;
  stdout: string;
  stderr: string;
}> {
  const { prompt, piBin, provider, model, cwd, threadId } = opts;
  const systemPrompt = opts.systemPrompt ||
    `You are a channel teammate. Respond with ONLY a JSON object (no markdown fences, no prose).
Schema: {"message": string (required — the chat reply), "plan"?: string[], "nextState"?: string, "artifact"?: {"title": string, "kind": "code"|"markdown"|"html"|"mermaid", "content": string}}
Write "message" as a normal teammate reply — not meta-commentary about the task.`;

  const args = [
    "-p", "--mode", "text", "--no-session", "--no-tools", "--thinking", "off",
    "--provider", provider, "--model", model,
    "--system-prompt", systemPrompt, prompt,
  ];

  const env = process.env;

  // For live-activity traces, optionally run JSON mode first for streaming,
  // then fall back to text mode. Skip for advance (simplicity; the existing
  // activity trace from trigger handles the live strip).
  const res = await execFileNoStdin(piBin, args, {
    timeout: opts.timeoutMs || 620_000,
    cwd,
    env,
    maxBuffer: 4 * 1024 * 1024,
  });

  const parsed = parseStructuredReply(res.stdout);
  return { parsed, stdout: res.stdout, stderr: res.stderr };
}

/**
 * Build a workflow-only prompt — no user message, just instructions for the
 * current state's enabled prompt workflows.
 */
export function buildWorkflowPrompt(opts: {
  lifecycleLabel: string;
  currentState: string;
  targetState: string;
  workflowInstructions: string[];
}): string {
  const instructions = opts.workflowInstructions.length
    ? opts.workflowInstructions.map((i) => `- ${i}`).join("\n")
    : "Complete the work for this state.";
  return [
    `You are advancing a ${opts.lifecycleLabel} thread from "${opts.currentState}" to "${opts.targetState}".`,
    ``,
    `Workflow instructions:`,
    instructions,
    ``,
    `After completing these instructions, set "nextState" to "${opts.targetState}" and include a brief "message" summarizing what you did.`,
  ].join("\n");
}
