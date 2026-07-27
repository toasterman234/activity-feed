import { randomUUID } from "crypto";
import { pool } from "@/app/api/_db";
import { LIFECYCLES } from "@/app/channels/lifecycles";

export type WorkflowEventType =
  | "workflow.created"
  | "workflow.template_changed"
  | "stage.transitioned"
  | "stage.gate_failed"
  | "verification.passed"
  | "verification.failed"
  | "workflow.completed";

export async function recordWorkflowEvent(opts: {
  threadId: string;
  channelId: string;
  lifecycle: string;
  eventType: WorkflowEventType;
  actor: string;
  fromState?: string | null;
  toState?: string | null;
  payload?: Record<string, unknown>;
  createdAt?: string;
}) {
  const template = LIFECYCLES[opts.lifecycle];
  await pool.query(
    `INSERT INTO thread_workflow_events (
       id, thread_id, channel_id, template_id, template_version,
       event_type, from_state, to_state, actor, payload, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      randomUUID(),
      opts.threadId,
      opts.channelId,
      opts.lifecycle,
      template?.version || 1,
      opts.eventType,
      opts.fromState ?? null,
      opts.toState ?? null,
      opts.actor,
      JSON.stringify(opts.payload || {}),
      opts.createdAt || new Date().toISOString(),
    ],
  );
}
