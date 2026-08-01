import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { pool } from "../_db";
import { stateKind } from "@/app/channels/lifecycles";
import { deriveThreadAttention } from "@/app/channels/attentionGuide";
import { listTasks, listProjects, tududiPublicBase } from "@/lib/tududi";
import { parseConventions } from "@/lib/tududiConventions";

const execFileAsync = promisify(execFile);

// ── Helpers ──

export function snippet(text: string, max = 100): string {
  const oneLine = (text || "").replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

export function firstLine(text: string): string {
  return ((text || "").split("\n", 1)[0] || "").split("\r", 1)[0]?.trim() || "Untitled thread";
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

// ── Agent health ──

export interface AgentRuntimeHealth {
  runtimeOk: boolean;
  runtimeError: string | null;
  liveAgents: Array<{
    id: string; shortId: string; name: string; provider: string;
    status: string; cwd: string;
  }>;
  signals: {
    paseo: "ok" | "missing" | "error";
    piBin: "ok" | "missing" | "error";
    workRuns: "ok" | "stale" | "none" | "error";
  };
  recoveryHint: string;
}

export async function getAgentRuntimeHealth(): Promise<AgentRuntimeHealth> {
  const signals: AgentRuntimeHealth["signals"] = {
    paseo: "missing", piBin: "missing", workRuns: "none",
  };

  const piBin = process.env.CHANNEL_PI_BIN || "pi";
  try {
    if (existsSync(piBin)) {
      signals.piBin = "ok";
    } else {
      const { stdout } = await execFileAsync("which", [piBin], { timeout: 1000 });
      if (stdout.trim()) signals.piBin = "ok";
    }
  } catch { signals.piBin = "missing"; }

  let paseoAgents: Record<string, unknown>[] = [];
  try {
    const { stdout } = await execFileAsync("paseo", ["ls", "--json"], {
      timeout: 1200, env: process.env, maxBuffer: 2 * 1024 * 1024,
    });
    paseoAgents = JSON.parse(stdout || "[]");
    signals.paseo = "ok";
  } catch { signals.paseo = "error"; }

  try {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM work_runs
       WHERE ((status = 'running' AND heartbeat_at > NOW() - INTERVAL '2 minutes')
          OR (status = 'succeeded' AND completed_at > NOW() - INTERVAL '24 hours'))`);
    if (Number(rows[0]?.count || 0) > 0) signals.workRuns = "ok";
  } catch { signals.workRuns = "error"; }

  const runtimeOk = signals.piBin === "ok";
  return {
    runtimeOk,
    runtimeError: runtimeOk ? null : "pi binary not found on host",
    liveAgents: paseoAgents.map((a: Record<string, unknown>) => ({
      id: String(a.id ?? ""),
      shortId: String(a.shortId ?? a.id ?? "").slice(0, 8),
      name: String(a.name ?? a.title ?? ""),
      provider: String(a.provider ?? ""),
      status: String(a.status ?? ""),
      cwd: String(a.cwd ?? ""),
    })),
    signals,
    recoveryHint: runtimeOk
      ? (signals.paseo === "error"
          ? "Paseo daemon is not running. Agent runtime is available via pi."
          : "")
      : "Install pi: npm install -g @earendil-works/pi-coding-agent",
  };
}

// ── Channel rollups ──

export type ChannelPulse = { author: string; snippet: string; createdAt: string };
export type ChannelRollup = {
  channelId: string; channelName: string; unreadCount: number;
  states: { start: number; active: number; wait: number; proven: number };
  lastPulse: ChannelPulse | null;
};

function emptyStates() { return { start: 0, active: 0, wait: 0, proven: 0 }; }

export async function getChannelRollups(viewer: string): Promise<ChannelRollup[]> {
  const [channelsRes, unreadRes, metaRes, pulseRes] = await Promise.all([
    pool.query<{ id: string; name: string }>(`SELECT id, name FROM channels ORDER BY name ASC`),
    pool.query<{ channel_id: string; unread_count: string }>(
      `SELECT c.id AS channel_id,
        COUNT(m.id) FILTER (WHERE m.author IS DISTINCT FROM $1
          AND m.created_at > COALESCE(rs.last_read_at, '1970-01-01T00:00:00.000Z'))::int AS unread_count
       FROM channels c
       LEFT JOIN channel_read_state rs ON rs.channel_id = c.id AND rs.viewer_id = $1
       LEFT JOIN messages m ON m.channel_id = c.id
       GROUP BY c.id`, [viewer]),
    pool.query<{ channel_id: string; lifecycle: string; state: string }>(
      `SELECT channel_id, lifecycle, state FROM thread_meta WHERE archived_at IS NULL`),
    pool.query<{ channel_id: string; author: string; body: string; created_at: string }>(
      `SELECT DISTINCT ON (channel_id) channel_id, author, body, created_at
       FROM messages ORDER BY channel_id, created_at DESC`),
  ]);

  const rollups = new Map<string, ChannelRollup>();
  for (const row of channelsRes.rows) {
    rollups.set(row.id, { channelId: row.id, channelName: row.name, unreadCount: 0, states: emptyStates(), lastPulse: null });
  }
  for (const row of unreadRes.rows) {
    const entry = rollups.get(row.channel_id);
    if (entry) entry.unreadCount = Number(row.unread_count) || 0;
  }
  for (const row of metaRes.rows) {
    const kind = stateKind(row.lifecycle, row.state);
    if (!kind || !(kind in emptyStates())) continue;
    const entry = rollups.get(row.channel_id);
    if (entry) entry.states[kind as keyof ChannelRollup["states"]] += 1;
  }
  for (const row of pulseRes.rows) {
    const entry = rollups.get(row.channel_id);
    if (entry) entry.lastPulse = { author: row.author, snippet: snippet(row.body, 80), createdAt: row.created_at };
  }
  return [...rollups.values()].sort((a, b) => {
    if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
    const aA = a.states.wait + a.states.active, bA = b.states.wait + b.states.active;
    if (aA !== bA) return bA - aA;
    return (b.lastPulse?.createdAt || "").localeCompare(a.lastPulse?.createdAt || "");
  });
}

// ── Approval threads ──

export type ApprovalReason = "review" | "blocked" | "failed_required_gate" | "issue_needs_triage";

export function threadAttentionGuide(row: {
  lifecycle: string; state: string; reason: ApprovalReason;
  assignee: string | null; repoId?: string | null; hasActiveReviewProposal?: boolean;
}): { nextStep: string; why: string } {
  const guide = deriveThreadAttention({
    lifecycle: row.lifecycle, state: row.state, assignee: row.assignee,
    repoId: row.repoId || null,
    promotionStatus: row.reason === "failed_required_gate" ? "failed_required_gate" : null,
    hasActiveReviewProposal: row.hasActiveReviewProposal,
  });
  if (guide) return { nextStep: guide.nextStep, why: guide.why };
  return { why: "This thread needs your attention.", nextStep: "Open the thread to see what's needed." };
}

// ── Data fetchers (panic-proof wrappers returning null on error) ──

export async function safeQuery<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

export async function fetchApprovalThreads() {
  return pool.query<{
    thread_id: string; channel_id: string; channel_name: string; title: string;
    lifecycle: string; state: string; assignee: string | null; repo_id: string | null;
    updated_at: string; reason: ApprovalReason; has_active_review_proposal: boolean;
  }>(
    `WITH latest_promotion AS (
       SELECT DISTINCT ON (thread_id) thread_id, status
       FROM thread_promotions ORDER BY thread_id, created_at DESC)
     SELECT tm.thread_id, tm.channel_id, c.name AS channel_name,
       split_part(root.body, E'\n', 1) AS title,
       tm.lifecycle, tm.state, tm.assignee, tm.repo_id, tm.updated_at,
       CASE
         WHEN lp.status = 'failed_required_gate' THEN 'failed_required_gate'
         WHEN tm.state = 'review' THEN 'review'
         WHEN tm.state = 'blocked' THEN 'blocked'
         WHEN tm.lifecycle = 'issue' AND tm.state = 'resolved' THEN 'review'
       END AS reason,
       EXISTS (SELECT 1 FROM thread_stage_interactions si
         WHERE si.thread_id = tm.thread_id AND si.stage_id = tm.state
         AND si.kind = 'review.proposal' AND si.status = 'active') AS has_active_review_proposal
     FROM thread_meta tm
     JOIN channels c ON c.id = tm.channel_id
     JOIN messages root ON root.id = tm.thread_id AND root.thread_id IS NULL
     LEFT JOIN latest_promotion lp ON lp.thread_id = tm.thread_id
     WHERE tm.archived_at IS NULL
       AND (lp.status = 'failed_required_gate'
         OR tm.state IN ('review', 'blocked')
         OR (tm.lifecycle = 'issue' AND tm.state = 'resolved'))
     ORDER BY CASE
       WHEN lp.status = 'failed_required_gate' THEN 0
       WHEN tm.state = 'blocked' THEN 1
       WHEN tm.state = 'review' THEN 2 ELSE 4
     END, tm.updated_at DESC`);
}

export async function fetchFailedPromotions() {
  return pool.query<{
    thread_id: string; channel_id: string; channel_name: string;
    status: string; progress: string | null; error_detail: string | null; created_at: string;
  }>(
    `WITH latest_promotion AS (
       SELECT DISTINCT ON (thread_id) id, thread_id, status, progress, error_detail, created_at
       FROM thread_promotions ORDER BY thread_id, created_at DESC)
     SELECT lp.thread_id, tm.channel_id, c.name AS channel_name,
       lp.status, lp.progress, lp.error_detail, lp.created_at
     FROM latest_promotion lp
     JOIN thread_meta tm ON tm.thread_id = lp.thread_id
     JOIN channels c ON c.id = tm.channel_id
     WHERE tm.archived_at IS NULL AND lp.status IN ('errored', 'failed_required_gate')
     ORDER BY lp.created_at DESC`);
}

export async function fetchActivityHighlights() {
  return pool.query<{ id: string; source: string; summary: string; detail: string; created_at: string }>(
    `SELECT id, source, summary, detail, created_at FROM activity_log ORDER BY created_at DESC LIMIT 30`);
}

export async function fetchThreadActivity() {
  return pool.query<{
    thread_id: string; channel_id: string; channel_name: string; title: string;
    lifecycle: string | null; state: string | null; assignee: string | null;
    repo_name: string | null; reply_count: string;
    last_author: string | null; last_message_at: string | null; updated_at: string | null;
  }>(
    `SELECT tm.thread_id, tm.channel_id, c.name AS channel_name,
       split_part(root.body, E'\n', 1) AS title,
       tm.lifecycle, tm.state, tm.assignee, r.name AS repo_name,
       COUNT(reply.id)::int AS reply_count,
       latest.author AS last_author, latest.created_at AS last_message_at, tm.updated_at
     FROM thread_meta tm
     JOIN channels c ON c.id = tm.channel_id
     JOIN messages root ON root.id = tm.thread_id AND root.thread_id IS NULL
     LEFT JOIN repos r ON r.id = tm.repo_id
     LEFT JOIN messages reply ON reply.thread_id = tm.thread_id
     LEFT JOIN LATERAL (
       SELECT m.author, m.created_at FROM messages m
       WHERE m.id = tm.thread_id OR m.thread_id = tm.thread_id
       ORDER BY m.created_at DESC LIMIT 1) latest ON true
     WHERE tm.archived_at IS NULL
     GROUP BY tm.thread_id, tm.channel_id, c.name, root.body, tm.lifecycle, tm.state,
       tm.assignee, r.name, latest.author, latest.created_at, tm.updated_at
     ORDER BY latest.created_at DESC NULLS LAST`);
}

export async function fetchActiveWork() {
  return pool.query<{
    thread_id: string; channel_id: string; channel_name: string; title: string;
    lifecycle: string; state: string;
    step_label: string | null; step_status: string | null;
    step_detail: string | null; step_created_at: string | null;
    promotion_status: string | null; promotion_progress: string | null;
  }>(
    `SELECT tm.thread_id, tm.channel_id, c.name AS channel_name,
       split_part(root.body, E'\n', 1) AS title,
       tm.lifecycle, tm.state,
       step.step_label, step.status AS step_status,
       step.detail AS step_detail, step.created_at AS step_created_at,
       promo.status AS promotion_status, promo.progress AS promotion_progress
     FROM thread_meta tm
     JOIN channels c ON c.id = tm.channel_id
     JOIN messages root ON root.id = tm.thread_id AND root.thread_id IS NULL
     LEFT JOIN LATERAL (
       SELECT step_label, status, detail, created_at
       FROM thread_workflow_steps WHERE thread_id = tm.thread_id
       ORDER BY created_at DESC LIMIT 1) step ON true
     LEFT JOIN LATERAL (
       SELECT status, progress FROM thread_promotions
       WHERE thread_id = tm.thread_id ORDER BY created_at DESC LIMIT 1) promo ON true
     WHERE tm.archived_at IS NULL
       AND ((tm.lifecycle = 'coding' AND tm.state IN ('running', 'testing'))
         OR (tm.lifecycle = 'research' AND tm.state IN ('searching', 'synthesizing'))
         OR (tm.lifecycle = 'planning' AND tm.state IN ('drafting'))
         OR (tm.lifecycle = 'issue' AND tm.state IN ('triaged', 'in_progress')))
     ORDER BY tm.updated_at DESC`);
}

export async function fetchRecentAgentActivity() {
  return pool.query<{ author: string; body: string; created_at: string; channel_id: string; thread_id: string | null }>(
    `SELECT author, body, created_at, channel_id,
       COALESCE(thread_id, id) AS thread_id
     FROM messages WHERE author LIKE '@%'
     ORDER BY created_at DESC LIMIT 8`);
}

export async function fetchThreadTududi() {
  return pool.query<{ thread_id: string; body: string }>(
    `SELECT DISTINCT ON (thread_id) thread_id, body
     FROM messages WHERE body LIKE '%tududi::task:%' AND thread_id IS NOT NULL
     ORDER BY thread_id, created_at DESC LIMIT 100`);
}

export async function fetchTududiGlance() {
  try {
    const projects = await listProjects();
    if (!projects.ok) return { ok: false as const, error: projects.error };
    const projectResults = await Promise.all(
      projects.projects.map(async (proj) => {
        const tasks = await listTasks({ project_uid: proj.uid });
        if (!tasks.ok) return null;
        const enriched = tasks.tasks.map((t) => {
          const tags = (t as { tags?: Array<{name?:string}|string> }).tags || [];
          const c = parseConventions(t.note, tags);
          return {
            uid: t.uid, name: t.name,
            status: typeof t.status === 'number' ? t.status : 0,
            kind: c.kind, stage: c.stage, outcome: c.outcome,
            blocked: c.blocked, repo: c.repo, note: t.note || '',
          };
        });
        const open = enriched.filter(t => t.status !== 2);
        const blocked = open.filter(t => t.blocked);
        const incidents = open.filter(t => (t.note || '').toLowerCase().includes('tags: incident'));
        const totalOpen = open.length;
        const hasSignal = incidents.length > 0 || blocked.length > 0 || open.some(t => t.kind && t.kind !== 'task');
        if (totalOpen === 0 || !hasSignal) return null;
        const sortKey = incidents.length * 10 + blocked.length * 5 + (open.filter(t => t.kind && t.kind !== 'task').length);
        return {
          uid: proj.uid, name: proj.name, open_count: totalOpen,
          blocked_count: blocked.length, incident_count: incidents.length,
          sort_key: sortKey, items: open.slice(0, 6),
        };
      }));
    const visible = (projectResults.filter(Boolean) as NonNullable<typeof projectResults[number]>[])
      .sort((a, b) => (b.sort_key ?? 0) - (a.sort_key ?? 0)).slice(0, 6);
    return {
      ok: true as const,
      public_base: tududiPublicBase(),
      total_open: visible.reduce((s, p) => s + p.open_count, 0),
      total_blocked: visible.reduce((s, p) => s + p.blocked_count, 0),
      projects: visible,
    };
  } catch (e) { return { ok: false as const, error: String(e) }; }
}

export async function fetchApprovedPlans() {
  return pool.query<{
    thread_id: string; channel_id: string; channel_name: string; title: string;
    repo_name: string | null; repo_id: string | null; assignee: string | null;
    task_count: string; approved_at: string | null; updated_at: string; active_execution_count: string;
  }>(
    `SELECT tm.thread_id, tm.channel_id, c.name AS channel_name,
       split_part(root.body, E'\n', 1) AS title,
       r.name AS repo_name, tm.repo_id, tm.assignee,
       (SELECT COUNT(*) FROM thread_plans tp WHERE tp.thread_id = tm.thread_id)::int AS task_count,
       (SELECT twe.created_at FROM thread_workflow_events twe
        WHERE twe.thread_id = tm.thread_id AND twe.to_state = 'accepted'
        AND twe.event_type = 'stage.transitioned' ORDER BY twe.created_at DESC LIMIT 1) AS approved_at,
       tm.updated_at,
       (SELECT COUNT(*) FROM thread_links tl JOIN thread_meta exm ON exm.thread_id = tl.target_thread_id
        WHERE tl.source_thread_id = tm.thread_id AND tl.relation = 'executes'
        AND exm.archived_at IS NULL
        AND exm.state NOT IN ('accepted','rejected','stopped','closed','wont_fix')
       )::int AS active_execution_count
     FROM thread_meta tm
     JOIN channels c ON c.id = tm.channel_id
     JOIN messages root ON root.id = tm.thread_id AND root.thread_id IS NULL
     LEFT JOIN repos r ON r.id = tm.repo_id
     WHERE tm.archived_at IS NULL AND tm.lifecycle = 'planning' AND tm.state = 'accepted'
     ORDER BY tm.updated_at DESC`);
}
