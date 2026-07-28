import type { Pool, PoolClient } from "pg";
import {
  LIFECYCLES,
  type Lifecycle,
  type StageGate,
  type StageModule,
  type StageModuleType,
} from "./lifecycles";

type Queryable = Pick<Pool | PoolClient, "query">;

export interface ThreadWorkflowContext {
  threadId: string;
  channelId: string;
  lifecycle: string;
  state: string;
  module: StageModule;
  definition: Lifecycle;
}

export async function resolveThreadStageModule(
  db: Queryable,
  opts: { threadId: string; channelId: string; type: StageModuleType },
): Promise<ThreadWorkflowContext | null> {
  const result = await db.query(
    `SELECT lifecycle, state, channel_id, template_snapshot
       FROM thread_meta
      WHERE thread_id = $1`,
    [opts.threadId],
  );
  const meta = result.rows[0] as { lifecycle: string; state: string; channel_id: string; template_snapshot: string | null } | undefined;
  if (!meta || meta.channel_id !== opts.channelId) return null;
  const definition = meta.template_snapshot
    ? JSON.parse(meta.template_snapshot) as Lifecycle
    : LIFECYCLES[meta.lifecycle];
  const module = definition?.states[meta.state]?.modules?.find((candidate) => candidate.type === opts.type);
  if (!module) return null;
  return {
    threadId: opts.threadId,
    channelId: opts.channelId,
    lifecycle: meta.lifecycle,
    state: meta.state,
    module,
    definition,
  };
}

export interface GateEvaluation {
  ok: boolean;
  failed: StageGate[];
}

export async function evaluateStageExitGates(
  db: Queryable,
  opts: { threadId: string; definition: Lifecycle; state: string; toState: string },
): Promise<GateEvaluation> {
  const gates = (opts.definition.states[opts.state]?.exitGates || [])
    .filter((gate) => !gate.toStates?.length || gate.toStates.includes(opts.toState));
  const failed: StageGate[] = [];

  for (const gate of gates) {
    let passed = false;
    if (gate.type === "interaction-approved") {
      const kind = String(gate.config?.kind || "");
      const result = await db.query(
        `SELECT EXISTS (
           SELECT 1 FROM thread_stage_interactions
            WHERE thread_id = $1 AND stage_id = $2 AND kind = $3 AND status = 'approved'
         ) AS passed`,
        [opts.threadId, opts.state, kind],
      );
      passed = Boolean(result.rows[0]?.passed);
    } else if (gate.type === "context-reviewed") {
      const result = await db.query(
        `SELECT EXISTS (
           SELECT 1 FROM thread_context_scans
            WHERE thread_id = $1 AND stage_id = $2 AND status = 'accepted'
         ) AS passed`,
        [opts.threadId, opts.state],
      );
      passed = Boolean(result.rows[0]?.passed);
    } else if (gate.type === "artifact-exists") {
      const title = String(gate.config?.title || "");
      const result = await db.query(
        `SELECT EXISTS (
           SELECT 1 FROM thread_artifacts
            WHERE thread_id = $1 AND stage_id = $2 AND ($3 = '' OR title = $3)
         ) AS passed`,
        [opts.threadId, opts.state, title],
      );
      passed = Boolean(result.rows[0]?.passed);
    } else if (gate.type === "tasks-complete") {
      const result = await db.query(
        `SELECT NOT EXISTS (
           SELECT 1 FROM thread_plans
            WHERE thread_id = $1 AND stage_id = $2 AND status <> 'done'
         ) AS passed`,
        [opts.threadId, opts.state],
      );
      passed = Boolean(result.rows[0]?.passed);
    } else if (gate.type === "approval-recorded") {
      const kind = String(gate.config?.kind || "stage.approval");
      const result = await db.query(
        `SELECT EXISTS (
           SELECT 1 FROM thread_stage_interactions
            WHERE thread_id = $1 AND stage_id = $2 AND kind = $3 AND status = 'approved'
         ) AS passed`,
        [opts.threadId, opts.state, kind],
      );
      passed = Boolean(result.rows[0]?.passed);
    }
    if (!passed) failed.push(gate);
  }
  return { ok: failed.length === 0, failed };
}
