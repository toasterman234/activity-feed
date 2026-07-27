import { randomUUID } from "crypto";
import { pool } from "../api/_db";
import { LIFECYCLES } from "./lifecycles";

export type GraphCapabilityId =
  | "prompt.fold_rules"
  | "lifecycle.workflow_toggle"
  | "reply.schema_field"
  | "memory.admission_threshold"
  | "channel.default_lifecycle";

export type PromptFoldRulesState = {
  max_memory: number;
  max_decisions: number;
  max_proposals: number;
};

export type WorkflowToggleState = {
  overrides: Array<{
    lifecycle: string;
    workflow_id: string;
    enabled: boolean;
  }>;
};

export const GRAPH_CAPABILITIES: Record<GraphCapabilityId, { label: string; description: string }> = {
  "prompt.fold_rules": {
    label: "Prompt fold rules",
    description: "Adjust how much continuity context is folded into the next agent turn.",
  },
  "lifecycle.workflow_toggle": {
    label: "Lifecycle workflow toggle",
    description: "Enable or disable a named workflow for a lifecycle in a channel.",
  },
  "reply.schema_field": {
    label: "Reply schema field",
    description: "Record an accepted schema-field follow-up for manual implementation.",
  },
  "memory.admission_threshold": {
    label: "Memory admission threshold",
    description: "Adjust the confidence threshold for automatic memory admission.",
  },
  "channel.default_lifecycle": {
    label: "Channel default lifecycle",
    description: "Change the default lifecycle used for new threads in a channel.",
  },
};

const DEFAULT_FOLD_RULES: PromptFoldRulesState = {
  max_memory: 20,
  max_decisions: 10,
  max_proposals: 5,
};

const DEFAULT_MEMORY_ADMISSION_THRESHOLD = 0.9;

type CapabilityStateRow = {
  id: string;
  capability_id: string;
  scope_type: string;
  scope_id: string | null;
  value: string;
};

type NormalizedProposalOp = {
  capabilityId: GraphCapabilityId;
  change: Record<string, unknown>;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, inner]) => [key, sortJson(inner)]);
  return Object.fromEntries(entries);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

async function loadCapabilityState(capabilityId: GraphCapabilityId, scopeType: string, scopeId: string | null) {
  const res = await pool.query(
    `SELECT id, capability_id, scope_type, scope_id, value
       FROM graph_capability_state
      WHERE capability_id = $1 AND scope_type = $2 AND COALESCE(scope_id, '') = COALESCE($3, '')
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1`,
    [capabilityId, scopeType, scopeId],
  ).catch(() => ({ rows: [] as CapabilityStateRow[] }));
  const row = res.rows[0] as CapabilityStateRow | undefined;
  if (!row) return null;
  try {
    return { row, value: asObject(JSON.parse(row.value || "{}")) };
  } catch {
    return { row, value: {} };
  }
}

async function upsertCapabilityState(opts: {
  capabilityId: GraphCapabilityId;
  scopeType: string;
  scopeId: string | null;
  value: Record<string, unknown>;
  actor: string;
  sourceProposalId: string;
}) {
  const now = new Date().toISOString();
  const existing = await loadCapabilityState(opts.capabilityId, opts.scopeType, opts.scopeId);
  const payload = canonicalJson(opts.value);
  if (existing?.row?.id) {
    await pool.query(
      `UPDATE graph_capability_state
          SET value = $2,
              updated_by = $3,
              source_proposal_id = $4,
              updated_at = $5
        WHERE id = $1`,
      [existing.row.id, payload, opts.actor, opts.sourceProposalId, now],
    );
    return existing.row.id;
  }
  const id = randomUUID();
  await pool.query(
    `INSERT INTO graph_capability_state (
       id, capability_id, scope_type, scope_id, value,
       source_proposal_id, updated_by, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [id, opts.capabilityId, opts.scopeType, opts.scopeId, payload, opts.sourceProposalId, opts.actor, now],
  );
  return id;
}

function requireString(value: unknown, field: string): string {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be boolean`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) throw new Error(`${field} must be numeric`);
  return num;
}

function normalizeCapabilityId(value: unknown): GraphCapabilityId {
  const text = requireString(value, "capability_id") as GraphCapabilityId;
  if (!(text in GRAPH_CAPABILITIES)) throw new Error(`unknown capability_id: ${text}`);
  return text;
}

function validateLifecycleId(value: unknown): string {
  const lifecycle = requireString(value, "lifecycle");
  if (!LIFECYCLES[lifecycle]) throw new Error(`unknown lifecycle: ${lifecycle}`);
  return lifecycle;
}

function validatePromptFoldRulesChange(change: Record<string, unknown>, channelId: string): Record<string, unknown> {
  const next: Record<string, unknown> = { channel_id: requireString(change.channel_id || channelId, "channel_id") };
  if (change.max_memory !== undefined) {
    const maxMemory = requireNumber(change.max_memory, "max_memory");
    if (!Number.isInteger(maxMemory) || maxMemory < 1 || maxMemory > 50) throw new Error("max_memory must be an integer between 1 and 50");
    next.max_memory = maxMemory;
  }
  if (change.max_decisions !== undefined) {
    const maxDecisions = requireNumber(change.max_decisions, "max_decisions");
    if (!Number.isInteger(maxDecisions) || maxDecisions < 0 || maxDecisions > 25) throw new Error("max_decisions must be an integer between 0 and 25");
    next.max_decisions = maxDecisions;
  }
  if (change.max_proposals !== undefined) {
    const maxProposals = requireNumber(change.max_proposals, "max_proposals");
    if (!Number.isInteger(maxProposals) || maxProposals < 0 || maxProposals > 25) throw new Error("max_proposals must be an integer between 0 and 25");
    next.max_proposals = maxProposals;
  }
  if (Object.keys(next).length === 1) throw new Error("prompt.fold_rules requires at least one concrete rule change");
  return next;
}

function validateMemoryAdmissionThresholdChange(change: Record<string, unknown>, channelId: string): Record<string, unknown> {
  const threshold = requireNumber(change.threshold, "threshold");
  if (threshold < 0 || threshold > 1) throw new Error("threshold must be between 0 and 1");
  return {
    channel_id: requireString(change.channel_id || channelId, "channel_id"),
    threshold,
  };
}

function validateChannelDefaultLifecycleChange(change: Record<string, unknown>, channelId: string): Record<string, unknown> {
  return {
    channel_id: requireString(change.channel_id || channelId, "channel_id"),
    default_lifecycle: validateLifecycleId(change.default_lifecycle),
  };
}

function validateWorkflowToggleChange(change: Record<string, unknown>, channelId: string): Record<string, unknown> {
  const lifecycle = validateLifecycleId(change.lifecycle);
  const workflowId = requireString(change.workflow_id, "workflow_id");
  if (!LIFECYCLES[lifecycle]?.workflows[workflowId]) throw new Error(`unknown workflow '${workflowId}' for lifecycle '${lifecycle}'`);
  return {
    channel_id: requireString(change.channel_id || channelId, "channel_id"),
    lifecycle,
    workflow_id: workflowId,
    enabled: requireBoolean(change.enabled, "enabled"),
  };
}

function validateReplySchemaFieldChange(change: Record<string, unknown>): Record<string, unknown> {
  return {
    field: requireString(change.field, "field"),
    follow_up: requireString(change.follow_up || "manual", "follow_up"),
  };
}

function validateChangeForCapability(capabilityId: GraphCapabilityId, change: Record<string, unknown>, channelId: string) {
  switch (capabilityId) {
    case "prompt.fold_rules":
      return validatePromptFoldRulesChange(change, channelId);
    case "memory.admission_threshold":
      return validateMemoryAdmissionThresholdChange(change, channelId);
    case "channel.default_lifecycle":
      return validateChannelDefaultLifecycleChange(change, channelId);
    case "lifecycle.workflow_toggle":
      return validateWorkflowToggleChange(change, channelId);
    case "reply.schema_field":
      return validateReplySchemaFieldChange(change);
  }
}

export function normalizeProposalOps(opts: {
  channelId: string;
  capabilityIds: string[];
  changes: Record<string, unknown>[];
}): NormalizedProposalOp[] {
  const capabilityIds = Array.from(new Set((opts.capabilityIds || []).map((value) => normalizeCapabilityId(value))));
  if (capabilityIds.length === 0) throw new Error("proposal must include at least one capability_id");
  if (!Array.isArray(opts.changes) || opts.changes.length === 0) throw new Error("proposal must include at least one change object");

  return opts.changes.map((rawChange) => {
    const input = asObject(rawChange);
    const explicitCapability = input.capability_id ? normalizeCapabilityId(input.capability_id) : null;
    let capabilityId: GraphCapabilityId;
    if (explicitCapability) {
      if (!capabilityIds.includes(explicitCapability)) throw new Error(`change capability_id '${explicitCapability}' is not listed in capability_ids`);
      capabilityId = explicitCapability;
    } else if (capabilityIds.length === 1) {
      capabilityId = capabilityIds[0];
    } else {
      throw new Error("each change must include capability_id when multiple capability_ids are present");
    }

    const normalizedChange = validateChangeForCapability(capabilityId, input, opts.channelId);
    return { capabilityId, change: normalizedChange };
  });
}

export function proposalDuplicateKey(ops: NormalizedProposalOp[]): string {
  return canonicalJson(
    ops.map((op) => ({
      capability_id: op.capabilityId,
      change: op.change,
    })),
  );
}

export async function getPromptFoldRules(channelId: string): Promise<PromptFoldRulesState> {
  const existing = await loadCapabilityState("prompt.fold_rules", "channel", channelId);
  return {
    max_memory: Number(existing?.value.max_memory ?? DEFAULT_FOLD_RULES.max_memory),
    max_decisions: Number(existing?.value.max_decisions ?? DEFAULT_FOLD_RULES.max_decisions),
    max_proposals: Number(existing?.value.max_proposals ?? DEFAULT_FOLD_RULES.max_proposals),
  };
}

export async function getMemoryAdmissionThreshold(channelId: string): Promise<number> {
  const existing = await loadCapabilityState("memory.admission_threshold", "channel", channelId);
  const threshold = Number(existing?.value.threshold ?? DEFAULT_MEMORY_ADMISSION_THRESHOLD);
  return Number.isFinite(threshold) ? threshold : DEFAULT_MEMORY_ADMISSION_THRESHOLD;
}

export async function applyWorkflowOverrides(channelId: string, lifecycle: string, enabledWorkflows: string[]): Promise<string[]> {
  const existing = await loadCapabilityState("lifecycle.workflow_toggle", "channel", channelId);
  const overrides = Array.isArray(existing?.value.overrides) ? existing?.value.overrides : [];
  const next = new Set(enabledWorkflows);
  for (const raw of overrides) {
    const entry = asObject(raw);
    if (String(entry.lifecycle || "") !== lifecycle) continue;
    const workflowId = String(entry.workflow_id || "").trim();
    if (!workflowId) continue;
    if (entry.enabled === true) next.add(workflowId);
    if (entry.enabled === false) next.delete(workflowId);
  }
  return Array.from(next);
}

export async function listOpenProposalTitles(channelId: string, threadId: string): Promise<string[]> {
  const res = await pool.query(
    `SELECT hypothesis
       FROM graph_proposals
      WHERE channel_id = $1 AND (thread_id = $2 OR thread_id IS NULL) AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 10`,
    [channelId, threadId],
  ).catch(() => ({ rows: [] as Array<{ hypothesis: string }> }));
  return res.rows.map((row) => String((row as { hypothesis?: string }).hypothesis || "").trim()).filter(Boolean);
}

export async function applyProposalChanges(opts: {
  proposalId: string;
  channelId: string;
  capabilityIds: string[];
  changes: Record<string, unknown>[];
  actor: string;
}): Promise<Array<{ capabilityId: GraphCapabilityId; summary: string }>> {
  const ops = normalizeProposalOps({ channelId: opts.channelId, capabilityIds: opts.capabilityIds, changes: opts.changes });
  const applied: Array<{ capabilityId: GraphCapabilityId; summary: string }> = [];

  for (const op of ops) {
    switch (op.capabilityId) {
      case "prompt.fold_rules": {
        const channelId = requireString(op.change.channel_id || opts.channelId, "channel_id");
        const current = await getPromptFoldRules(channelId);
        const next = {
          max_memory: Number(op.change.max_memory ?? current.max_memory),
          max_decisions: Number(op.change.max_decisions ?? current.max_decisions),
          max_proposals: Number(op.change.max_proposals ?? current.max_proposals),
        };
        await upsertCapabilityState({
          capabilityId: op.capabilityId,
          scopeType: "channel",
          scopeId: channelId,
          value: next,
          actor: opts.actor,
          sourceProposalId: opts.proposalId,
        });
        applied.push({ capabilityId: op.capabilityId, summary: `fold rules → memory ${next.max_memory}, decisions ${next.max_decisions}, proposals ${next.max_proposals}` });
        break;
      }
      case "memory.admission_threshold": {
        const channelId = requireString(op.change.channel_id || opts.channelId, "channel_id");
        const threshold = Number(op.change.threshold);
        await upsertCapabilityState({
          capabilityId: op.capabilityId,
          scopeType: "channel",
          scopeId: channelId,
          value: { threshold },
          actor: opts.actor,
          sourceProposalId: opts.proposalId,
        });
        applied.push({ capabilityId: op.capabilityId, summary: `memory admission threshold → ${threshold}` });
        break;
      }
      case "channel.default_lifecycle": {
        const channelId = requireString(op.change.channel_id || opts.channelId, "channel_id");
        const lifecycle = validateLifecycleId(op.change.default_lifecycle);
        await pool.query(`UPDATE channels SET default_lifecycle = $2 WHERE id = $1`, [channelId, lifecycle]);
        applied.push({ capabilityId: op.capabilityId, summary: `channel default lifecycle → ${lifecycle}` });
        break;
      }
      case "lifecycle.workflow_toggle": {
        const channelId = requireString(op.change.channel_id || opts.channelId, "channel_id");
        const lifecycle = validateLifecycleId(op.change.lifecycle);
        const workflowId = requireString(op.change.workflow_id, "workflow_id");
        const enabled = requireBoolean(op.change.enabled, "enabled");
        const existing = await loadCapabilityState(op.capabilityId, "channel", channelId);
        const currentOverrides = Array.isArray(existing?.value.overrides) ? existing?.value.overrides.map((entry) => asObject(entry)) : [];
        const filtered = currentOverrides.filter((entry) => !(String(entry.lifecycle || "") === lifecycle && String(entry.workflow_id || "") === workflowId));
        filtered.push({ lifecycle, workflow_id: workflowId, enabled });
        await upsertCapabilityState({
          capabilityId: op.capabilityId,
          scopeType: "channel",
          scopeId: channelId,
          value: { overrides: filtered },
          actor: opts.actor,
          sourceProposalId: opts.proposalId,
        });
        applied.push({ capabilityId: op.capabilityId, summary: `${enabled ? "enable" : "disable"} workflow ${workflowId} for ${lifecycle}` });
        break;
      }
      case "reply.schema_field": {
        const field = requireString(op.change.field, "field");
        const followUp = requireString(op.change.follow_up || "manual", "follow_up");
        await upsertCapabilityState({
          capabilityId: op.capabilityId,
          scopeType: "global",
          scopeId: null,
          value: { field, follow_up: followUp },
          actor: opts.actor,
          sourceProposalId: opts.proposalId,
        });
        applied.push({ capabilityId: op.capabilityId, summary: `schema field noted for manual follow-up: ${field}` });
        break;
      }
    }
  }

  return applied;
}
