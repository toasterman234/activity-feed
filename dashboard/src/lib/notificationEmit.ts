import { randomUUID } from "crypto";
import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool | PoolClient, "query">;

/**
 * Event types that map to notification events.
 * Must match notification_preferences.event_type values.
 */
export type NotificationEvent =
  | "workflow.blocked"
  | "workflow.approval_required"
  | "work_run.completed"
  | "work_run.failed"
  | "work_run.interrupted"
  | "verification.passed"
  | "verification.failed"
  | "deployment.completed"
  | "deployment.failed"
  | "task.reply"
  | "stage.transitioned"
  | "test.delivery";

const URGENCY_MAP: Record<string, "high" | "normal" | "low"> = {
  "workflow.blocked": "high",
  "workflow.approval_required": "high",
  "work_run.failed": "high",
  "verification.failed": "high",
  "deployment.failed": "high",
  "work_run.completed": "normal",
  "verification.passed": "normal",
  "deployment.completed": "normal",
  "task.reply": "normal",
  "stage.transitioned": "low",
  "work_run.interrupted": "normal",
  "test.delivery": "low",
};

export interface EmitNotificationInput {
  event: NotificationEvent;
  threadId: string;
  channelId: string;
  stageId?: string;
  title: string;
  body: string;
  appUrl: string;
  /** Unique ID from the triggering source row (for idempotency) */
  sourceEventId: string;
  actor?: string;
}

/**
 * Insert a notification into the outbox for async delivery.
 * Idempotent: (source_event_id, event) is unique.
 *
 * Call this from finishWorkRun, transitionThreadState, proposal creation, etc.
 */
export async function emitNotification(
  db: Queryable,
  input: EmitNotificationInput,
): Promise<void> {
  const urgency = URGENCY_MAP[input.event] || "normal";
  try {
    await db.query(
      `INSERT INTO notification_outbox (id, event, urgency, thread_id, channel_id, stage_id,
         title, body, app_url, source_event_id, actor, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12)
       ON CONFLICT (source_event_id, event) DO NOTHING`,
      [
        randomUUID(),
        input.event,
        urgency,
        input.threadId,
        input.channelId,
        input.stageId || null,
        input.title.slice(0, 100),
        input.body.slice(0, 200),
        input.appUrl,
        input.sourceEventId,
        input.actor || null,
        new Date().toISOString(),
      ],
    );
  } catch (error) {
    // Non-fatal: notification delivery is best-effort, never blocks the main event
    console.error("[notifications] emit failed:", (error as Error).message);
  }
}
