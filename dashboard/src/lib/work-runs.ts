import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  canonicalJson,
  hashWorkRunConfig,
  type WorkRunConfigSnapshot,
  type WorkRunStatus,
} from "./work-run-contract.ts";

type Queryable = Pick<Pool | PoolClient, "query">;

export interface WorkRunRow {
  id: string;
  request_id: string;
  idempotency_key: string;
  attempt: number;
  max_attempts: number;
  parent_run_id: string | null;
  thread_id: string;
  channel_id: string;
  stage_id: string;
  repo_id: string | null;
  kind: string;
  status: WorkRunStatus;
  agent_registry_id: string;
  agent_version: string | null;
  model: string | null;
  config_snapshot: WorkRunConfigSnapshot;
  config_hash: string;
  worker_id: string | null;
  worker_host: string | null;
  lease_expires_at: Date | null;
  heartbeat_at: Date | null;
  cancel_requested_at: Date | null;
  cwd: string | null;
  branch: string | null;
  base_commit: string | null;
  raw_ref: string | null;
  request_payload: Record<string, unknown>;
  result_payload: Record<string, unknown>;
  error_detail: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
}

export interface QueueWorkRunInput {
  idempotencyKey: string;
  requestId?: string;
  threadId: string;
  channelId: string;
  stageId: string;
  repoId?: string | null;
  kind?: string;
  maxAttempts?: number;
  agent: WorkRunConfigSnapshot;
  cwd?: string | null;
  branch?: string | null;
  baseCommit?: string | null;
  requestPayload?: Record<string, unknown>;
}

export async function queueWorkRun(
  db: Queryable,
  input: QueueWorkRunInput,
): Promise<WorkRunRow> {
  const id = randomUUID();
  const requestId = input.requestId || id;
  const configSnapshot = canonicalJson(input.agent);
  const configHash = hashWorkRunConfig(input.agent);
  const requestPayload = canonicalJson(input.requestPayload || {});
  const result = await db.query<WorkRunRow>(
    `WITH inserted AS (
       INSERT INTO work_runs (
         id, request_id, idempotency_key, attempt, max_attempts,
         thread_id, channel_id, stage_id, repo_id, kind, status,
         agent_registry_id, agent_version, model, config_snapshot, config_hash,
         cwd, branch, base_commit, request_payload
       )
       VALUES (
         $1, $2, $3, 1, $4,
         $5, $6, $7, $8, $9, 'queued',
         $10, $11, $12, $13::jsonb, $14,
         $15, $16, $17, $18::jsonb
       )
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *
     )
     SELECT * FROM inserted
     UNION ALL
     SELECT * FROM work_runs WHERE idempotency_key = $3
     LIMIT 1`,
    [
      id,
      requestId,
      input.idempotencyKey,
      input.maxAttempts || 3,
      input.threadId,
      input.channelId,
      input.stageId,
      input.repoId || null,
      input.kind || "channel.agent",
      input.agent.agentRegistryId,
      input.agent.agentVersion || null,
      input.agent.model || null,
      configSnapshot,
      configHash,
      input.cwd || null,
      input.branch || null,
      input.baseCommit || null,
      requestPayload,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("work run was not queued");
  return row;
}

export async function getWorkRun(db: Queryable, runId: string): Promise<WorkRunRow | null> {
  const result = await db.query<WorkRunRow>(`SELECT * FROM work_runs WHERE id = $1`, [runId]);
  return result.rows[0] || null;
}

export async function listThreadWorkRuns(
  db: Queryable,
  threadId: string,
  limit = 20,
): Promise<WorkRunRow[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const result = await db.query<WorkRunRow>(
    `SELECT * FROM work_runs
      WHERE thread_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [threadId, boundedLimit],
  );
  return result.rows;
}
