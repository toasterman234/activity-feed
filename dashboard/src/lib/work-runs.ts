import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  canonicalJson,
  hashWorkRunConfig,
  leaseExpiry,
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

export async function claimNextWorkRun(
  db: Queryable,
  input: {
    workerId: string;
    workerHost: string;
    leaseMs?: number;
    now?: Date;
  },
): Promise<WorkRunRow | null> {
  const now = input.now || new Date();
  const result = await db.query<WorkRunRow>(
    `WITH candidate AS (
       SELECT id
         FROM work_runs
        WHERE status = 'queued'
          AND cancel_requested_at IS NULL
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     UPDATE work_runs AS run
        SET status = 'running',
            worker_id = $1,
            worker_host = $2,
            started_at = COALESCE(started_at, $3::timestamptz),
            heartbeat_at = $3::timestamptz,
            lease_expires_at = $4::timestamptz,
            updated_at = $3::timestamptz
       FROM candidate
      WHERE run.id = candidate.id
      RETURNING run.*`,
    [input.workerId, input.workerHost, now.toISOString(), leaseExpiry(now, input.leaseMs || 120_000)],
  );
  return result.rows[0] || null;
}

export async function startWorkRun(
  db: Queryable,
  input: {
    runId: string;
    workerId: string;
    workerHost: string;
    leaseMs?: number;
    now?: Date;
  },
): Promise<WorkRunRow | null> {
  const now = input.now || new Date();
  const result = await db.query<WorkRunRow>(
    `UPDATE work_runs
        SET status = 'running',
            worker_id = $2,
            worker_host = $3,
            started_at = COALESCE(started_at, $4::timestamptz),
            heartbeat_at = $4::timestamptz,
            lease_expires_at = $5::timestamptz,
            updated_at = $4::timestamptz
      WHERE id = $1
        AND status = 'queued'
        AND cancel_requested_at IS NULL
      RETURNING *`,
    [
      input.runId,
      input.workerId,
      input.workerHost,
      now.toISOString(),
      leaseExpiry(now, input.leaseMs || 120_000),
    ],
  );
  return result.rows[0] || null;
}

export async function heartbeatWorkRun(
  db: Queryable,
  input: { runId: string; workerId: string; leaseMs?: number; now?: Date },
): Promise<WorkRunRow | null> {
  const now = input.now || new Date();
  const result = await db.query<WorkRunRow>(
    `UPDATE work_runs
        SET heartbeat_at = $3::timestamptz,
            lease_expires_at = $4::timestamptz,
            updated_at = $3::timestamptz
      WHERE id = $1
        AND worker_id = $2
        AND status = 'running'
      RETURNING *`,
    [input.runId, input.workerId, now.toISOString(), leaseExpiry(now, input.leaseMs || 120_000)],
  );
  return result.rows[0] || null;
}

export async function finishWorkRun(
  db: Queryable,
  input: {
    runId: string;
    workerId: string;
    status: "succeeded" | "failed";
    resultPayload?: Record<string, unknown>;
    errorDetail?: string | null;
    rawRef?: string | null;
    now?: Date;
  },
): Promise<WorkRunRow | null> {
  const now = input.now || new Date();
  const result = await db.query<WorkRunRow>(
    `UPDATE work_runs
        SET status = $3,
            result_payload = $4::jsonb,
            error_detail = $5,
            raw_ref = COALESCE($6, raw_ref),
            completed_at = $7::timestamptz,
            lease_expires_at = NULL,
            updated_at = $7::timestamptz
      WHERE id = $1
        AND worker_id = $2
        AND status = 'running'
      RETURNING *`,
    [
      input.runId,
      input.workerId,
      input.status,
      canonicalJson(input.resultPayload || {}),
      input.errorDetail || null,
      input.rawRef || null,
      now.toISOString(),
    ],
  );
  return result.rows[0] || null;
}

export async function interruptExpiredWorkRuns(
  db: Queryable,
  now = new Date(),
): Promise<WorkRunRow[]> {
  const result = await db.query<WorkRunRow>(
    `UPDATE work_runs
        SET status = 'interrupted',
            error_detail = COALESCE(error_detail, 'worker lease expired'),
            completed_at = $1::timestamptz,
            lease_expires_at = NULL,
            updated_at = $1::timestamptz
      WHERE status = 'running'
        AND lease_expires_at < $1::timestamptz
      RETURNING *`,
    [now.toISOString()],
  );
  return result.rows;
}
