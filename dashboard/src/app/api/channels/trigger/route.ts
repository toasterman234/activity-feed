import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { spawn } from "child_process";
import { pool } from "../../_db";
import {
  parseMentions,
  piInvocationForHandle,
} from "../../../../lib/mentions";
import { LIFECYCLES } from "@/app/channels/lifecycles";
import { researchHintForState } from "@/app/channels/researchModes";
import { transitionThreadState } from "@/app/channels/transitionThread";
import { ensureThreadWorkspace, buildResearchInvocation } from "@/lib/channelAgentRuntime";
import { execFileNoStdin } from "@/lib/execFileNoStdin";

export const dynamic = "force-dynamic";

const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || "http://127.0.0.1:3000";


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

// ─── Live activity trace (gated by CHANNEL_LIVE_ACTIVITY=1) ────────────────
//
// REAL `pi --mode json` event schema (captured by hand 2026-07-26 running
// `pi -p --mode json --thinking low "..."` — NOT assumed). `--mode rpc` only
// emitted extension_ui_request UI-chrome (notify/setStatus/setWidget) with no
// content/thinking/final-message events, so we use `--mode json`.
//
// Each stdout line is one JSON object. Relevant events, in order:
//   session                                   run boot (id, cwd)
//   agent_start / turn_start
//   message_start {message.role:"user"}       the prompt echoed back
//   message_start {message.role:"assistant"}  reply begins (provider/model)
//   message_update {assistantMessageEvent:{...}}  streaming deltas, subtypes:
//       thinking_start / thinking_delta{delta} / thinking_end{content}
//       toolcall_start{partial.content[i].toolCall{id,name,arguments}}
//       toolcall_end{toolCall{id,name,arguments}}
//       text_start / text_delta{delta} / text_end{content}   ← the final reply
//   tool_execution_start {toolCallId,toolName,args}
//   tool_execution_update {toolCallId, partialResult.content[]}
//   tool_execution_end   {toolCallId,toolName, result.content[{type:"text",text}]}
//   message_end {message.role:"assistant", content:[thinking, text, ...]}
//   turn_end / agent_end / agent_settled
//
// Event → activity row mapping:
//   thinking_start/delta/end  → one coalesced kind:'thinking' row per block
//   toolcall_start            → kind:'tool' status:'running' label:'calling <name>'
//   tool_execution_end        → flip that tool row to status:'done', append output
//   text_*                    → accumulated into the final reply (NOT an activity row)
//   message_end(assistant)    → authoritative final { thinking, text }
//
// We derive the structured reply (message/plan/nextState/artifact) from the
// concatenated assistant TEXT content, parsed exactly like the --mode text path.
async function upsertActivityEvent(row: {
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

// Retention: activity is disposable and high-volume. On each new run, drop
// everything but the most recent few runs for this thread so the table never
// grows unbounded (Task 1 retention decision: keep-last-N-runs, not time-based —
// simpler, no cron, and the UI only ever shows the current run).
const ACTIVITY_KEEP_RUNS = 3;
async function pruneThreadActivity(threadId: string) {
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
    console.error("[channels/trigger] activity prune failed:", (e as Error).message);
  }
}

type StreamOutcome = {
  /** Concatenated assistant text content (the structured-JSON reply string). */
  text: string;
  /** Raw stderr for error reporting. */
  stderr: string;
};

// Live inline trace: overwrite the placeholder message body in place as the
// agent thinks/acts. `messages` is a held live shape, so these updates surface
// in the conversation in real time (unlike the polled activity strip).
async function updateMessageBody(id: string, body: string) {
  await pool.query(`UPDATE messages SET body = $2 WHERE id = $1`, [id, body]);
}

// Keep the last N chars of streaming thinking so the inline body stays readable
// on a phone rather than ballooning into a wall of text.
function tail(s: string, max: number): string {
  const t = (s || "").trim();
  return t.length <= max ? t : `…${t.slice(t.length - max)}`;
}

/**
 * Spawn `pi --mode json`, stream line-delimited events into
 * thread_activity_events rows, and resolve the final assistant text.
 * Throws on non-zero exit / timeout / spawn error (caller falls back).
 */
function streamPiActivity(opts: {
  bin: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeout: number;
  threadId: string;
  runId: string;
  /** Placeholder message id to live-overwrite with the inline trace (optional). */
  inlineMessageId?: string;
}): Promise<StreamOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts.bin, opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ["ignore", "pipe", "pipe"], // ignore stdin — `pi -p` hangs on open stdin
    });

    let buf = "";
    let stderr = "";
    let finalText = "";
    let seq = 0;
    let settled = false;
    let timedOut = false;

    // Coalesced thinking: one row per thinking block, updated in place.
    let thinkingRowId: string | null = null;
    let thinkingText = "";
    // One row per tool call, keyed by pi's toolCallId.
    const toolRows = new Map<string, { id: string; name: string }>();

    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, opts.timeout);

    const emit = (row: Parameters<typeof upsertActivityEvent>[0]) => {
      // Fire-and-forget: never let a DB hiccup break the stream parse.
      void upsertActivityEvent(row).catch((e) =>
        console.error("[channels/trigger] activity upsert failed:", (e as Error).message));
    };

    // ── Inline live trace (overwrites the placeholder message in the thread) ──
    // Ordered log of tool actions as human lines; thinking is shown live as a
    // rolling tail. Rebuilt into a markdown body and pushed (throttled) to the
    // placeholder message so it animates right where the user is chatting.
    const toolLog: string[] = [];
    const toolLineIdx = new Map<string, number>();
    let writing = false;
    let lastPush = 0;
    let pushTimer: NodeJS.Timeout | null = null;

    const renderInline = (): string => {
      const parts: string[] = [];
      if (thinkingText.trim()) parts.push(`🤔 _Thinking…_\n\n${tail(thinkingText, 700)}`);
      for (const line of toolLog) parts.push(line);
      if (writing && !finalText.trim()) parts.push(`✍️ _Writing reply…_`);
      return parts.join("\n\n") || "_working…_";
    };

    const pushInline = (force = false) => {
      if (!opts.inlineMessageId) return;
      const now = Date.now();
      const flush = () => {
        lastPush = Date.now();
        void updateMessageBody(opts.inlineMessageId as string, renderInline())
          .catch((e) => console.error("[channels/trigger] inline update failed:", (e as Error).message));
      };
      // Throttle to ~600ms; `messages` is a live shape so we avoid write spam,
      // but always flush immediately on a forced (terminal) state change.
      if (force || now - lastPush >= 600) {
        if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
        flush();
      } else if (!pushTimer) {
        pushTimer = setTimeout(() => { pushTimer = null; flush(); }, 600 - (now - lastPush));
      }
    };

    const handleEvent = (o: Record<string, unknown>) => {
      const type = o.type as string | undefined;
      if (type === "message_update") {
        const ev = o.assistantMessageEvent as Record<string, unknown> | undefined;
        if (!ev) return;
        const et = ev.type as string;
        if (et === "thinking_start") {
          thinkingRowId = randomUUID();
          thinkingText = "";
          emit({ id: thinkingRowId, threadId: opts.threadId, runId: opts.runId, seq: seq++,
            kind: "thinking", label: "thinking", detail: "", status: "running" });
        } else if (et === "thinking_delta") {
          thinkingText += (ev.delta as string) || "";
          if (thinkingRowId) {
            emit({ id: thinkingRowId, threadId: opts.threadId, runId: opts.runId, seq: seq,
              kind: "thinking", label: "thinking", detail: thinkingText, status: "running" });
          }
          pushInline();
        } else if (et === "thinking_end") {
          const content = (ev.content as string) || thinkingText;
          if (thinkingRowId) {
            emit({ id: thinkingRowId, threadId: opts.threadId, runId: opts.runId, seq: seq,
              kind: "thinking", label: "thought", detail: content, status: "done" });
          }
          thinkingRowId = null;
          pushInline(true);
        } else if (et === "toolcall_start" || et === "toolcall_end") {
          // Read the toolCall off the event (end) or the partial content (start).
          let tc = ev.toolCall as { id?: string; name?: string; arguments?: unknown } | undefined;
          if (!tc) {
            const partial = ev.partial as { content?: Array<Record<string, unknown>> } | undefined;
            const items = partial?.content || [];
            tc = items.find((c) => c.type === "toolCall") as typeof tc;
          }
          if (tc?.id && tc.name) {
            let entry = toolRows.get(tc.id);
            if (!entry) {
              entry = { id: randomUUID(), name: tc.name }; toolRows.set(tc.id, entry);
              toolLineIdx.set(tc.id, toolLog.length);
              toolLog.push(`🔧 ${tc.name}…`);
              pushInline(true);
            }
            const argStr = tc.arguments ? JSON.stringify(tc.arguments).slice(0, 500) : "";
            emit({ id: entry.id, threadId: opts.threadId, runId: opts.runId, seq: seq++,
              kind: "tool", label: `calling ${tc.name}`, detail: argStr, status: "running" });
          }
        } else if (et === "text_delta") {
          finalText += (ev.delta as string) || "";
          if (!writing) { writing = true; pushInline(true); }
        } else if (et === "text_end") {
          if (ev.content) finalText = ev.content as string;
        }
      } else if (type === "tool_execution_end") {
        const id = o.toolCallId as string;
        const entry = toolRows.get(id);
        if (entry) {
          const result = o.result as { content?: Array<{ type?: string; text?: string }> } | undefined;
          const out = (result?.content || [])
            .filter((c) => c.type === "text").map((c) => c.text || "").join("\n");
          emit({ id: entry.id, threadId: opts.threadId, runId: opts.runId, seq: seq,
            kind: "tool", label: `ran ${entry.name}`, detail: out.slice(0, 2000), status: "done" });
          const li = toolLineIdx.get(id);
          if (li != null) { toolLog[li] = `✓ ${entry.name}`; pushInline(true); }
        }
      } else if (type === "message_end") {
        // Authoritative assistant content — prefer its text over accumulated deltas.
        const msg = o.message as { role?: string; content?: Array<Record<string, unknown>> } | undefined;
        if (msg?.role === "assistant" && Array.isArray(msg.content)) {
          const text = msg.content.filter((c) => c.type === "text")
            .map((c) => (c.text as string) || "").join("");
          if (text.trim()) finalText = text;
        }
      }
    };

    const drainLines = (flush = false) => {
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try { handleEvent(JSON.parse(line)); } catch { /* non-JSON chatter — ignore */ }
      }
      if (flush && buf.trim()) {
        try { handleEvent(JSON.parse(buf.trim())); } catch { /* ignore */ }
        buf = "";
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => { buf += chunk.toString(); drainLines(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const finish = (err: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
      drainLines(true);
      if (err) { (err as Error & { stderr?: string }).stderr = stderr; reject(err); }
      else resolve({ text: finalText, stderr });
    };

    child.on("error", (err) => finish(err));
    child.on("close", (code, signal) => {
      if (code === 0 && !timedOut) return finish(null);
      finish(Object.assign(
        new Error(timedOut ? `pi timed out after ${opts.timeout}ms` : `pi exited code=${code} signal=${signal}`),
        { code, signal, killed: timedOut },
      ));
    });
  });
}

async function writePlan(threadId: string, items: string[]) {
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

async function writeArtifact(threadId: string, artifact: { title: string; kind: string; content: string }) {
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

async function ensureAgentMember(channelId: string, handle: string) {
  const existing = await pool.query(
    `SELECT id FROM channel_members
     WHERE channel_id = $1 AND member_type = 'agent' AND lower(member_name) = lower($2)
     LIMIT 1`,
    [channelId, handle],
  );
  if (existing.rowCount && existing.rowCount > 0) return;
  await pool.query(
    `INSERT INTO channel_members (id, channel_id, member_type, member_name, created_at)
     VALUES ($1, $2, 'agent', $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [randomUUID(), channelId, handle, new Date().toISOString()],
  );
}

async function resolveRepoCwd(threadId: string): Promise<string | null> {
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

async function resolveCwd(channelId: string): Promise<string> {
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
    // Project workspaces live on the Mini; on OVH fall back to the dashboard root
    // so execFile cwd exists (missing cwd → spawn ENOENT).
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

function buildPrompt(opts: {
  handle: string;
  channelName: string;
  threadBody: string;
  userBody: string;
  recent: { author: string; body: string }[];
  workflowInstructions?: string[];
}): string {
  const recentBlock = opts.recent
    .map((m) => `${m.author}: ${m.body}`)
    .join("\n");
  const workflowBlock = opts.workflowInstructions?.length
    ? [
        "Active workflows (follow these instructions):",
        ...opts.workflowInstructions.map((inst) => `- ${inst}`),
        "",
      ]
    : [];
  return [
    `You were @${opts.handle}-mentioned in dashboard channel #${opts.channelName}.`,
    `Reply as a helpful teammate in that thread.`,
    ...workflowBlock,
    ``,
    `Thread root:`,
    opts.threadBody,
    ``,
    recentBlock ? `Recent replies:\n${recentBlock}\n` : "",
    `User message that mentioned you:`,
    opts.userBody,
  ]
    .filter(Boolean)
    .join("\n");
}

async function runMentionJob(opts: {
  handle: string;
  channelId: string;
  threadId: string;
  channelName: string;
  userBody: string;
  threadBody: string;
  recent: { author: string; body: string }[];
  cwd: string;
}) {
  const author = `@${opts.handle}`;
  const thinkingId = randomUUID();
  const stepId = randomUUID();
  await insertMessage({
    id: thinkingId,
    channel_id: opts.channelId,
    thread_id: opts.threadId,
    author,
    body: `_working…_`,
    created_at: new Date().toISOString(),
  });
  await upsertWorkflowStep({
    id: stepId,
    threadId: opts.threadId,
    label: `${author} responding`,
    status: "running",
  });

  const systemPrompt =
    process.env.CHANNEL_REPLY_SYSTEM_PROMPT ||
    `You are a channel teammate. Respond with ONLY a JSON object (no markdown fences, no prose).
Schema: {"message": string (required — the chat reply), "plan"?: string[], "nextState"?: string, "artifact"?: {"title": string, "kind": "code"|"markdown"|"html"|"mermaid", "content": string}}
Write "message" as a normal teammate reply — not meta-commentary about the task.`;

  try {
    // Load lifecycle meta and gather workflow instructions for the current state
    const metaRes = await pool.query(
      `SELECT lifecycle, state, enabled_workflows, research_mode FROM thread_meta WHERE thread_id = $1`,
      [opts.threadId],
    );
    const lifecycleKey = (metaRes.rows[0]?.lifecycle as string) || "coding";
    const currentState = (metaRes.rows[0]?.state as string) || "drafted";
    const researchMode = (metaRes.rows[0]?.research_mode as string) || "";
    let enabledWorkflows: string[] = [];
    try { enabledWorkflows = metaRes.rows[0]?.enabled_workflows ? JSON.parse(metaRes.rows[0].enabled_workflows as string) : []; } catch {}
    const lc = LIFECYCLES[lifecycleKey];
    const workflowInstructions: string[] = [];
    // Research style: fold the mode's phase-appropriate hint in first, so the
    // approach frames the rest of the workflow instructions.
    if (lifecycleKey === "research" && researchMode) {
      const hint = researchHintForState(researchMode, currentState);
      if (hint) workflowInstructions.push(hint);
    }
    if (lc) {
      for (const [wfId, wf] of Object.entries(lc.workflows)) {
        if (enabledWorkflows.includes(wfId) && wf.kind === "prompt" && wf.runsAt === currentState && wf.instruction) {
          workflowInstructions.push(wf.instruction);
        }
      }
    }

    const prompt = buildPrompt({ ...opts, workflowInstructions: workflowInstructions.length ? workflowInstructions : undefined });
    const { provider, model } = piInvocationForHandle(opts.handle);
    const piBin = process.env.CHANNEL_PI_BIN || "pi";

    // Research lifecycle gets REAL tools (exa + ax-research toolset), run under a
    // macOS sandbox that confines writes to a per-thread workspace. Every other
    // lifecycle keeps the tool-less, chat-shaped one-shot (unchanged behavior).
    let runBin: string;
    let runArgs: string[];
    let runEnv: NodeJS.ProcessEnv;
    let cwd: string;
    // Gated: research agents only get real tools + sandbox when explicitly
    // enabled. Off by default so nothing changes in the live channels until the
    // exa/registry-over-network piece is finished and browser-verified.
    const researchToolsEnabled = process.env.CHANNEL_RESEARCH_TOOLS === "1";
    // Live activity trace: opt-in, off by default. Mirrors CHANNEL_RESEARCH_TOOLS.
    // When on, the chat path runs `--mode json --thinking low` (thinking now
    // visible → something to stream) and we upsert activity rows as events land.
    // When off, everything below is byte-for-byte the pre-existing behavior.
    const liveActivity = process.env.CHANNEL_LIVE_ACTIVITY === "1";
    // Only the tool-less chat path streams for now (research path already spawns
    // its own sandboxed invocation; leave it untouched).
    let streamable = false;
    if (lifecycleKey === "research" && researchToolsEnabled) {
      const threadDir = await ensureThreadWorkspace(opts.threadId);
      const inv = buildResearchInvocation({ threadDir, piBin, provider, model, systemPrompt, prompt });
      runBin = inv.bin; runArgs = inv.args; runEnv = inv.env; cwd = inv.cwd;
    } else {
      // Issues resolve cwd from their target repo instead of the channel's project member
      const repoCwd = await resolveRepoCwd(opts.threadId);
      if (repoCwd && existsSync(repoCwd)) {
        cwd = repoCwd;
      } else if (repoCwd) {
        await insertMessage({
          id: randomUUID(),
          channel_id: opts.channelId,
          thread_id: opts.threadId,
          author: "system",
          body: `⚠️ Target repo path not found: ${repoCwd}. Falling back to channel cwd.`,
          created_at: new Date().toISOString(),
        });
        cwd = opts.cwd;
      } else {
        cwd = opts.cwd;
      }
      runBin = piBin;
      if (liveActivity) {
        // JSON event stream, thinking on so there is a live trace to show.
        runArgs = [
          "-p", "--mode", "json", "--no-session", "--no-tools", "--thinking", "low",
          "--provider", provider, "--model", model, "--system-prompt", systemPrompt, prompt,
        ];
        streamable = true;
      } else {
        runArgs = [
          "-p", "--mode", "text", "--no-session", "--no-tools", "--thinking", "off",
          "--provider", provider, "--model", model, "--system-prompt", systemPrompt, prompt,
        ];
      }
      runEnv = process.env;
    }

    // A run_id groups this invocation's activity rows. Prune old runs up front so
    // the UI's "current run" filter and the table stay bounded.
    const runId = randomUUID();
    if (streamable) await pruneThreadActivity(opts.threadId);

    // Producer: stream `pi --mode json` into activity rows when enabled, else run
    // the unchanged one-shot. Streaming is ADDITIVE — if the stream throws or
    // yields no usable text, fall back to the original blocking text invocation
    // so end-behavior (reply/plan/artifact/nextState) always survives.
    let stdout = "";
    let stderr = "";
    let streamedOk = false;
    if (streamable) {
      try {
        const status = { id: randomUUID(), seq: 0 };
        await upsertActivityEvent({
          id: status.id, threadId: opts.threadId, runId, seq: status.seq,
          kind: "status", label: `${author} thinking…`, status: "running",
        });
        const outcome = await streamPiActivity({
          bin: runBin, args: runArgs, cwd, env: runEnv,
          timeout: 620_000, threadId: opts.threadId, runId,
          inlineMessageId: thinkingId,
        });
        stdout = outcome.text;
        stderr = outcome.stderr;
        streamedOk = !!(outcome.text || "").trim();
        await upsertActivityEvent({
          id: status.id, threadId: opts.threadId, runId, seq: status.seq,
          kind: "status", label: `${author} replied`, status: "done",
        });
      } catch (streamErr) {
        // Mark the run errored in the trace, then fall back to the text one-shot.
        console.error("[channels/trigger] activity stream failed, falling back:", (streamErr as Error).message);
        await upsertActivityEvent({
          id: randomUUID(), threadId: opts.threadId, runId, seq: 9998,
          kind: "error", label: "live trace failed — using fallback",
          detail: (streamErr as Error).message.slice(0, 500), status: "error",
        }).catch(() => {});
        streamedOk = false;
      }
    }

    if (!streamedOk) {
      // Fallback / default path: blocking one-shot with the original text args.
      // (If streaming was attempted, re-run with text args so we still reply.)
      const fbArgs = streamable
        ? ["-p", "--mode", "text", "--no-session", "--no-tools", "--thinking", "off",
           "--provider", (piInvocationForHandle(opts.handle)).provider,
           "--model", (piInvocationForHandle(opts.handle)).model,
           "--system-prompt", systemPrompt, prompt]
        : runArgs;
      // Must ignore stdin: Node execFile pipes an open stdin, and `pi -p`
      // hangs forever waiting on it (empty stdout/stderr → 620s SIGTERM).
      const res = await execFileNoStdin(runBin, fbArgs, {
        timeout: 620_000,
        cwd,
        env: runEnv,
        maxBuffer: 4 * 1024 * 1024,
      });
      stdout = res.stdout;
      stderr = res.stderr;
    }

    type StructuredReply = {
      message?: string;
      plan?: string[];
      nextState?: string;
      artifact?: { title: string; kind: string; content: string };
    };
    let parsed: StructuredReply = {};
    {
      let raw = (stdout || "").trim();
      // Strip optional ```json fences
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced) raw = fenced[1].trim();
      try {
        parsed = JSON.parse(raw || "{}") as StructuredReply;
      } catch {
        const match = raw.match(/\{[\s\S]*\}\s*$/);
        if (match) parsed = JSON.parse(match[0]) as StructuredReply;
      }
    }
    const reply = (parsed.message || "").trim();
    if (!reply) {
      throw new Error(`empty structured reply. stdout=${(stdout || "").slice(0, 300)} stderr=${(stderr || "").slice(0, 200)}`);
    }

    await pool.query(`DELETE FROM messages WHERE id = $1`, [thinkingId]);
    await insertMessage({
      id: randomUUID(),
      channel_id: opts.channelId,
      thread_id: opts.threadId,
      author,
      body: reply,
      created_at: new Date().toISOString(),
    });
    if (parsed.plan?.length) await writePlan(opts.threadId, parsed.plan);
    if (parsed.artifact?.title && parsed.artifact?.content) await writeArtifact(opts.threadId, parsed.artifact);

    // Handle nextState via shared helper (command workflows + gates).
    // Transition always announces itself (success / gated failure / system message).
    if (parsed.nextState && lc) {
      const tr = await transitionThreadState({
        threadId: opts.threadId,
        channelId: opts.channelId,
        toState: parsed.nextState,
        actor: author,
        announce: true,
      });
      if (!tr.ok) {
        // Surface rejection reasons the helper couldn't announce (illegal, unknown lifecycle, etc.)
        const reason =
          tr.error === "illegal transition"
            ? `Agent proposed transition ${tr.from || "?"}→${tr.to || tr.error}, which is not allowed.`
            : tr.error;
        await insertMessage({
          id: randomUUID(),
          channel_id: opts.channelId,
          thread_id: opts.threadId,
          author: "system",
          body: `⚠️ Could not advance state: ${reason}`,
          created_at: new Date().toISOString(),
        });
      }
    }

    await upsertWorkflowStep({ id: stepId, threadId: opts.threadId, label: `${author} responding`, status: "done" });
  } catch (err) {
    console.error("[channels/trigger] job failed for", opts.handle, err);
    const e = err as Error & { signal?: string | null; killed?: boolean; stderr?: string; code?: number | null };
    const detail = [
      e.message,
      e.signal ? `signal=${e.signal}` : null,
      e.killed ? "killed=true" : null,
      e.code != null ? `code=${e.code}` : null,
      e.stderr ? `stderr=${e.stderr.slice(0, 200)}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    await pool.query(`DELETE FROM messages WHERE id = $1`, [thinkingId]).catch(() => {});
    await insertMessage({
      id: randomUUID(),
      channel_id: opts.channelId,
      thread_id: opts.threadId,
      author,
      body: `Failed to respond: ${detail.slice(0, 400)}`,
      created_at: new Date().toISOString(),
    });
    await upsertWorkflowStep({
      id: stepId, threadId: opts.threadId, label: `${author} responding`, status: "error",
      detail: detail.slice(0, 200),
    });
    // Never leave activity rows stuck 'running' — that would keep the UI's
    // burst-refresh loop spinning forever. Flip any lingering running rows for
    // this thread to error so the strip settles.
    await pool.query(
      `UPDATE thread_activity_events
          SET status = 'error', updated_at = $2
        WHERE thread_id = $1 AND status = 'running'`,
      [opts.threadId, new Date().toISOString()],
    ).catch(() => {});
  }
}


export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    channelId,
    threadId,
    text,
    mentions: mentionsIn,
  } = body as {
    channelId?: string;
    threadId?: string | null;
    text?: string;
    mentions?: string[];
  };

  if (!channelId || !text?.trim()) {
    return NextResponse.json({ error: "channelId and text required" }, { status: 400 });
  }

  const mentions = (mentionsIn?.length ? mentionsIn : parseMentions(text)).map((m) =>
    m.replace(/^@/, ""),
  );
  if (mentions.length === 0) {
    return NextResponse.json({ ok: true, mentions: [], triggered: 0 });
  }

  // Root of a new thread: threadId may be the just-created top-level message id.
  // Replies: threadId is the parent thread root.
  const rootId = threadId || null;
  if (!rootId) {
    return NextResponse.json(
      { error: "threadId required (use the top-level message id for new threads)" },
      { status: 400 },
    );
  }

  const ch = await pool.query(`SELECT name FROM channels WHERE id = $1`, [channelId]);
  const channelName = (ch.rows[0]?.name as string) || channelId;

  const root = await pool.query(
    `SELECT body FROM messages WHERE id = $1 AND channel_id = $2`,
    [rootId, channelId],
  );
  const threadBody = (root.rows[0]?.body as string) || text;

  const recentRes = await pool.query(
    `SELECT author, body FROM messages
     WHERE channel_id = $1 AND thread_id = $2
     ORDER BY created_at DESC LIMIT 8`,
    [channelId, rootId],
  );
  const recent = [...recentRes.rows]
    .reverse()
    .map((r) => ({ author: String(r.author), body: String(r.body) }));

  const cwd = await resolveCwd(channelId);

  for (const handle of mentions) {
    await ensureAgentMember(channelId, handle);
    // Fire-and-forget — reply lands via live shape when ready
    void runMentionJob({
      handle,
      channelId,
      threadId: rootId,
      channelName,
      userBody: text,
      threadBody,
      recent,
      cwd,
    });
  }

  return NextResponse.json({
    ok: true,
    mentions,
    triggered: mentions.length,
    origin: DASHBOARD_ORIGIN,
  });
}
