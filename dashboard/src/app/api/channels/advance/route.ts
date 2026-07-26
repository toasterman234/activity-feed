import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "../../_db";
import { LIFECYCLES } from "@/app/channels/lifecycles";
import { transitionThreadState } from "@/app/channels/transitionThread";
import {
  runAgentPrompt,
  buildWorkflowPrompt,
  upsertWorkflowStep,
  type StructuredReply,
} from "@/lib/runAgentPrompt";
import { piInvocationForHandle } from "@/lib/mentions";
import { resolveChannelCwd } from "@/app/channels/transitionThread";
import { resolveRepoCwd } from "@/app/channels/transitionThread";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

type AdvanceResult = {
  ok: boolean;
  state?: string;
  from?: string;
  to?: string;
  terminal?: boolean;
  error?: string;
  systemMessage?: string;
  agentReply?: string;
};

async function advance(opts: {
  threadId: string;
  channelId: string;
  actor?: string;
}): Promise<AdvanceResult> {
  const actor = opts.actor || "you";

  // 1. Read thread meta
  const metaRes = await pool.query(
    `SELECT lifecycle, state, enabled_workflows, archived_at, channel_id
       FROM thread_meta WHERE thread_id = $1`,
    [opts.threadId],
  );
  const meta = metaRes.rows[0] as
    | { lifecycle: string; state: string; enabled_workflows: string; archived_at: string | null; channel_id: string }
    | undefined;

  if (!meta) return { ok: false, error: "No lifecycle set on this thread" };
  if (meta.archived_at) return { ok: false, error: "Thread is archived" };
  if (meta.channel_id !== opts.channelId) return { ok: false, error: "Channel mismatch" };

  const lifecycleKey = meta.lifecycle;
  const lc = LIFECYCLES[lifecycleKey];
  if (!lc) return { ok: false, error: `Unknown lifecycle: ${lifecycleKey}` };

  const currentState = meta.state;
  const currentStateDef = lc.states[currentState];
  if (currentStateDef?.terminal) {
    return { ok: true, state: currentState, from: currentState, to: currentState, terminal: true };
  }

  // 2. Determine next state — first non-dead legal transition
  const legalNext = lc.transitions[currentState] || [];
  const mainNext =
    legalNext.find((to) => {
      const s = lc.states[to];
      return s && s.kind !== "dead";
    }) || legalNext[0];

  if (!mainNext) return { ok: true, state: currentState, terminal: false };

  // 3. Gather prompt workflow instructions for the NEXT state (the state we're
  //    advancing into — those workflows fire now as we enter it).
  let enabledWorkflows: string[] = [];
  try { enabledWorkflows = meta.enabled_workflows ? JSON.parse(meta.enabled_workflows) : []; } catch {}

  const workflowInstructions: string[] = [];
  for (const [wfId, wf] of Object.entries(lc.workflows)) {
    if (enabledWorkflows.includes(wfId) && wf.kind === "prompt" && wf.runsAt === mainNext && wf.instruction) {
      workflowInstructions.push(wf.instruction);
    }
  }

  // 4. Run agent with workflow instructions
  const stepId = randomUUID();
  await upsertWorkflowStep({ id: stepId, threadId: opts.threadId, label: "GuideBar advance", status: "running" });

  const handle = "pi"; // default agent for GuideBar advances
  const { provider, model } = piInvocationForHandle(handle);
  const piBin = process.env.CHANNEL_PI_BIN || "pi";

  // Resolve cwd
  const repoCwd = await resolveRepoCwd(opts.threadId);
  let cwd: string;
  if (repoCwd && existsSync(repoCwd)) {
    cwd = repoCwd;
  } else {
    cwd = await resolveChannelCwd(opts.channelId);
  }

  const prompt = buildWorkflowPrompt({
    lifecycleLabel: lc.label,
    currentState: currentStateDef.label,
    targetState: lc.states[mainNext]?.label || mainNext,
    workflowInstructions,
  });

  let structured: StructuredReply;
  try {
    const outcome = await runAgentPrompt({
      prompt,
      piBin,
      provider,
      model,
      cwd,
      threadId: opts.threadId,
    });
    structured = outcome.parsed;
  } catch (err) {
    await upsertWorkflowStep({
      id: stepId, threadId: opts.threadId, label: "GuideBar advance",
      status: "error", detail: (err as Error).message.slice(0, 200),
    });
    return { ok: false, error: `Agent failed: ${(err as Error).message.slice(0, 200)}` };
  }

  await upsertWorkflowStep({ id: stepId, threadId: opts.threadId, label: "GuideBar advance", status: "done" });

  // 5. If agent proposed a nextState, validate it; fall back to mainNext
  const agentNextState = structured.nextState;
  const toState = agentNextState && lc.transitions[currentState]?.includes(agentNextState)
    ? agentNextState
    : mainNext;

  // 6. Run the transition (command workflows + gates)
  const tr = await transitionThreadState({
    threadId: opts.threadId,
    channelId: opts.channelId,
    toState,
    actor: `${actor} (GuideBar)`,
    announce: true,
  });

  if (!tr.ok) {
    return { ok: false, error: tr.error, from: tr.from, to: tr.to };
  }

  const newState = tr.to;
  const newStateDef = lc.states[newState];

  return {
    ok: true,
    state: newState,
    from: tr.from,
    to: newState,
    terminal: newStateDef?.terminal === true,
    agentReply: (structured.message || "").trim() || undefined,
    systemMessage: agentNextState && agentNextState !== toState
      ? `Agent proposed "${agentNextState}" — used "${toState}" instead.`
      : undefined,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { threadId, channelId } = body as {
    threadId?: string;
    channelId?: string;
  };

  if (!threadId || !channelId) {
    return NextResponse.json({ error: "threadId and channelId required" }, { status: 400 });
  }

  const result = await advance({ threadId, channelId });
  const status = result.ok ? (result.terminal ? 200 : 200) : 409;
  return NextResponse.json(result, { status });
}
