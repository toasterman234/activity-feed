import { createHash } from "node:crypto";

export const WORK_RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "interrupted",
  "cancelled",
] as const;

export type WorkRunStatus = (typeof WORK_RUN_STATUSES)[number];

export interface WorkRunConfigSnapshot {
  agentRegistryId: string;
  agentVersion?: string | null;
  model?: string | null;
  skills?: string[];
  toolsets?: string[];
  workflowTemplateId?: string | null;
  workflowTemplateVersion?: number | null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function hashWorkRunConfig(snapshot: WorkRunConfigSnapshot): string {
  return createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

export function isTerminalWorkRunStatus(status: WorkRunStatus): boolean {
  return status === "succeeded" || status === "cancelled";
}

export function canRetryWorkRun(status: WorkRunStatus, attempt: number, maxAttempts: number): boolean {
  return (status === "failed" || status === "interrupted") && attempt < maxAttempts;
}

export function leaseExpiry(now: Date, leaseMs: number): string {
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
    throw new Error("leaseMs must be a positive finite number");
  }
  return new Date(now.getTime() + leaseMs).toISOString();
}

