import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { pool } from "../../_db";
import { stateKind } from "@/app/channels/lifecycles";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

type ChannelPulse = {
  author: string;
  snippet: string;
  createdAt: string;
};

type ChannelRollup = {
  channelId: string;
  channelName: string;
  unreadCount: number;
  states: { start: number; active: number; wait: number; proven: number };
  lastPulse: ChannelPulse | null;
};

type ApprovalReason = "review" | "blocked" | "failed_required_gate" | "issue_needs_triage";

function emptyStates(): ChannelRollup["states"] {
  return { start: 0, active: 0, wait: 0, proven: 0 };
}

function snippet(text: string, max = 100): string {
  const oneLine = (text || "").replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

function firstLine(text: string): string {
  return ((text || "").split("\n", 1)[0] || "").split("\r", 1)[0]?.trim() || "Untitled thread";
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function getLiveAgents(): Promise<{ runtimeOk: boolean; runtimeError: string | null; liveAgents: Array<{ id: string; shortId: string; name: string; provider: string; status: string; cwd: string; }>; }> {
  try {
    const { stdout } = await execFileAsync("paseo", ["ls", "--json"], {
      timeout: 1200,
      env: process.env,
      maxBuffer: 2 * 1024 * 1024,
    });
    const agents = JSON.parse(stdout || "[]");
    return {
      runtimeOk: true,
      runtimeError: null,
      liveAgents: (Array.isArray(agents) ? agents : []).map((agent: Record<string, unknown>) => ({
        id: String(agent.id ?? ""),
        shortId: String(agent.shortId ?? agent.id ?? "").slice(0, 8),
        name: String(agent.name ?? agent.title ?? ""),
        provider: String(agent.provider ?? ""),
        status: String(agent.status ?? ""),
        cwd: String(agent.cwd ?? ""),
      })),
    };
  } catch (error) {
    return {
      runtimeOk: false,
      runtimeError: String(error),
      liveAgents: [],
    };
  }
}

async function getChannelRollups(viewer: string): Promise<ChannelRollup[]> {
  const [channelsRes, unreadRes, metaRes, pulseRes] = await Promise.all([
    pool.query<{ id: string; name: string }>(`SELECT id, name FROM channels ORDER BY name ASC`),
    pool.query<{ channel_id: string; unread_count: string }>(
      `SELECT c.id AS channel_id,
              COUNT(m.id) FILTER (
                WHERE m.author IS DISTINCT FROM $1
                  AND m.created_at > COALESCE(rs.last_read_at, '1970-01-01T00:00:00.000Z')
              )::int AS unread_count
         FROM channels c
         LEFT JOIN channel_read_state rs
           ON rs.channel_id = c.id AND rs.viewer_id = $1
         LEFT JOIN messages m ON m.channel_id = c.id
         GROUP BY c.id`,
      [viewer],
    ),
    pool.query<{ channel_id: string; lifecycle: string; state: string }>(
      `SELECT channel_id, lifecycle, state
         FROM thread_meta
        WHERE archived_at IS NULL`,
    ),
    pool.query<{ channel_id: string; author: string; body: string; created_at: string }>(
      `SELECT DISTINCT ON (channel_id)
         channel_id, author, body, created_at
       FROM messages
       ORDER BY channel_id, created_at DESC`,
    ),
  ]);

  const rollups = new Map<string, ChannelRollup>();
  for (const row of channelsRes.rows) {
    rollups.set(row.id, {
      channelId: row.id,
      channelName: row.name,
      unreadCount: 0,
      states: emptyStates(),
      lastPulse: null,
    });
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
    if (!entry) continue;
    entry.lastPulse = {
      author: row.author,
      snippet: snippet(row.body, 80),
      createdAt: row.created_at,
    };
  }

  return [...rollups.values()].sort((a, b) => {
    if (a.unreadCount != b.unreadCount) return b.unreadCount - a.unreadCount;
    const aAttention = a.states.wait + a.states.active;
    const bAttention = b.states.wait + b.states.active;
    if (aAttention != bAttention) return bAttention - aAttention;
    return (b.lastPulse?.createdAt || "").localeCompare(a.lastPulse?.createdAt || "");
  });
}

export async function GET() {
  try {
    const viewer = "you";
    const [channels, approvalsRes, promotionsRes, activityRes, threadsRes, workRes, recentAgentRes, agents] = await Promise.all([
      getChannelRollups(viewer),
      pool.query<{
        thread_id: string;
        channel_id: string;
        channel_name: string;
        title: string;
        lifecycle: string;
        state: string;
        assignee: string | null;
        updated_at: string;
        reason: ApprovalReason;
      }>(
        `WITH latest_promotion AS (
           SELECT DISTINCT ON (thread_id)
             thread_id, status
           FROM thread_promotions
           ORDER BY thread_id, created_at DESC
         )
         SELECT tm.thread_id,
                tm.channel_id,
                c.name AS channel_name,
                split_part(root.body, E'
', 1) AS title,
                tm.lifecycle,
                tm.state,
                tm.assignee,
                tm.updated_at,
                CASE
                  WHEN lp.status = 'failed_required_gate' THEN 'failed_required_gate'
                  WHEN tm.state = 'review' THEN 'review'
                  WHEN tm.state = 'blocked' THEN 'blocked'
                  ELSE 'issue_needs_triage'
                END AS reason
           FROM thread_meta tm
           JOIN channels c ON c.id = tm.channel_id
           JOIN messages root ON root.id = tm.thread_id AND root.thread_id IS NULL
           LEFT JOIN latest_promotion lp ON lp.thread_id = tm.thread_id
          WHERE tm.archived_at IS NULL
            AND (
              lp.status = 'failed_required_gate'
              OR tm.state IN ('review', 'blocked')
              OR (
                tm.lifecycle = 'issue'
                AND (tm.repo_id IS NULL OR COALESCE(tm.assignee, '') = '')
              )
            )
          ORDER BY CASE
            WHEN lp.status = 'failed_required_gate' THEN 0
            WHEN tm.state = 'blocked' THEN 1
            WHEN tm.state = 'review' THEN 2
            ELSE 3
          END, tm.updated_at DESC`,
      ),
      pool.query<{
        thread_id: string;
        channel_id: string;
        channel_name: string;
        status: string;
        progress: string | null;
        error_detail: string | null;
        created_at: string;
      }>(
        `WITH latest_promotion AS (
           SELECT DISTINCT ON (thread_id)
             id, thread_id, status, progress, error_detail, created_at
           FROM thread_promotions
           ORDER BY thread_id, created_at DESC
         )
         SELECT lp.thread_id,
                tm.channel_id,
                c.name AS channel_name,
                lp.status,
                lp.progress,
                lp.error_detail,
                lp.created_at
           FROM latest_promotion lp
           JOIN thread_meta tm ON tm.thread_id = lp.thread_id
           JOIN channels c ON c.id = tm.channel_id
          WHERE tm.archived_at IS NULL
            AND lp.status IN ('errored', 'failed_required_gate')
          ORDER BY lp.created_at DESC`,
      ),
      pool.query<{ id: string; source: string; summary: string; detail: string; created_at: string }>(
        `SELECT id, source, summary, detail, created_at
           FROM activity_log
          ORDER BY created_at DESC
          LIMIT 30`,
      ),
      pool.query<{
        thread_id: string;
        channel_id: string;
        channel_name: string;
        title: string;
        lifecycle: string | null;
        state: string | null;
        assignee: string | null;
        repo_name: string | null;
        reply_count: string;
        last_author: string | null;
        last_message_at: string | null;
        updated_at: string | null;
      }>(
        `SELECT tm.thread_id,
                tm.channel_id,
                c.name AS channel_name,
                split_part(root.body, E'
', 1) AS title,
                tm.lifecycle,
                tm.state,
                tm.assignee,
                r.name AS repo_name,
                COUNT(reply.id)::int AS reply_count,
                latest.author AS last_author,
                latest.created_at AS last_message_at,
                tm.updated_at
           FROM thread_meta tm
           JOIN channels c ON c.id = tm.channel_id
           JOIN messages root ON root.id = tm.thread_id AND root.thread_id IS NULL
           LEFT JOIN repos r ON r.id = tm.repo_id
           LEFT JOIN messages reply ON reply.thread_id = tm.thread_id
           LEFT JOIN LATERAL (
             SELECT m.author, m.created_at
               FROM messages m
              WHERE m.id = tm.thread_id OR m.thread_id = tm.thread_id
              ORDER BY m.created_at DESC
              LIMIT 1
           ) latest ON true
          WHERE tm.archived_at IS NULL
          GROUP BY tm.thread_id, tm.channel_id, c.name, root.body, tm.lifecycle, tm.state, tm.assignee, r.name, latest.author, latest.created_at, tm.updated_at
          ORDER BY latest.created_at DESC NULLS LAST`,
      ),
      pool.query<{
        thread_id: string;
        channel_id: string;
        channel_name: string;
        title: string;
        lifecycle: string;
        state: string;
        step_label: string | null;
        step_status: string | null;
        step_detail: string | null;
        step_created_at: string | null;
        promotion_status: string | null;
        promotion_progress: string | null;
      }>(
        `SELECT tm.thread_id,
                tm.channel_id,
                c.name AS channel_name,
                split_part(root.body, E'
', 1) AS title,
                tm.lifecycle,
                tm.state,
                step.step_label,
                step.status AS step_status,
                step.detail AS step_detail,
                step.created_at AS step_created_at,
                promo.status AS promotion_status,
                promo.progress AS promotion_progress
           FROM thread_meta tm
           JOIN channels c ON c.id = tm.channel_id
           JOIN messages root ON root.id = tm.thread_id AND root.thread_id IS NULL
           LEFT JOIN LATERAL (
             SELECT step_label, status, detail, created_at
               FROM thread_workflow_steps
              WHERE thread_id = tm.thread_id
              ORDER BY created_at DESC
              LIMIT 1
           ) step ON true
           LEFT JOIN LATERAL (
             SELECT status, progress
               FROM thread_promotions
              WHERE thread_id = tm.thread_id
              ORDER BY created_at DESC
              LIMIT 1
           ) promo ON true
          WHERE tm.archived_at IS NULL
            AND (
              (tm.lifecycle = 'coding' AND tm.state IN ('running', 'testing'))
              OR (tm.lifecycle = 'research' AND tm.state IN ('searching', 'synthesizing'))
              OR (tm.lifecycle = 'planning' AND tm.state IN ('drafting'))
              OR (tm.lifecycle = 'issue' AND tm.state IN ('triaged', 'in_progress'))
            )
          ORDER BY tm.updated_at DESC`,
      ),
      pool.query<{ author: string; body: string; created_at: string; channel_id: string; thread_id: string | null }>(
        `SELECT author,
                body,
                created_at,
                channel_id,
                COALESCE(thread_id, id) AS thread_id
           FROM messages
          WHERE author LIKE '@%'
          ORDER BY created_at DESC
          LIMIT 8`,
      ),
      getLiveAgents(),
    ]);

    const unreadChannels = channels.filter((channel) => channel.unreadCount > 0);
    const approvalThreads = approvalsRes.rows.map((row) => ({
      threadId: row.thread_id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      title: firstLine(row.title),
      lifecycle: row.lifecycle,
      state: row.state,
      assignee: row.assignee,
      reason: row.reason,
      updatedAt: row.updated_at,
    }));
    const failedPromotions = promotionsRes.rows.map((row) => ({
      threadId: row.thread_id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      status: row.status,
      progress: row.progress,
      errorDetail: row.error_detail,
      createdAt: row.created_at,
    }));
    const threadActivity = threadsRes.rows.map((row) => ({
      threadId: row.thread_id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      title: firstLine(row.title),
      lifecycle: row.lifecycle,
      state: row.state,
      assignee: row.assignee,
      repoName: row.repo_name,
      replyCount: Number(row.reply_count) || 0,
      lastAuthor: row.last_author,
      lastMessageAt: row.last_message_at,
      updatedAt: row.updated_at,
    }));
    const activeThreads = workRes.rows.map((row) => ({
      threadId: row.thread_id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      title: firstLine(row.title),
      lifecycle: row.lifecycle,
      state: row.state,
      latestStep: row.step_label ? {
        label: row.step_label,
        status: row.step_status || "pending",
        detail: row.step_detail,
        createdAt: row.step_created_at,
      } : null,
      promotion: row.promotion_status ? {
        status: row.promotion_status,
        progress: row.promotion_progress,
      } : null,
    }));
    const channelNames = new Map(channels.map((channel) => [channel.channelId, channel.channelName]));
    const recentAgentActivity = recentAgentRes.rows.map((row) => ({
      author: row.author,
      source: row.author.replace(/^@/, ""),
      snippet: snippet(row.body, 90),
      createdAt: row.created_at,
      channelId: row.channel_id,
      channelName: channelNames.get(row.channel_id) || null,
      threadId: row.thread_id,
    }));
    const recentHighlights = activityRes.rows
      .filter((row) => row.source !== "setup")
      .slice(0, 6)
      .map((row) => {
        const detail = parseJson<{ project?: string; session_id?: string }>(row.detail);
        const lower = `${row.source} ${row.summary}`.toLowerCase();
        const importance = lower.includes("failed") || lower.includes("promot") || lower.includes("block") || row.source === "pi"
          ? "high"
          : "normal";
        return {
          id: row.id,
          source: row.source,
          summary: row.summary,
          project: detail?.project || null,
          sessionId: detail?.session_id || null,
          createdAt: row.created_at,
          importance,
        };
      });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summaryCounts: {
        unread: unreadChannels.length,
        needsMe: approvalThreads.length + failedPromotions.length,
        active: activeThreads.length,
        failed: failedPromotions.length,
        agentsDown: !agents.runtimeOk,
      },
      topUnread: unreadChannels.slice(0, 3),
      topNeedsMe: approvalThreads.slice(0, 3),
      topActive: activeThreads.slice(0, 3),
      topThreads: threadActivity.slice(0, 3),
      topPulse: channels.slice(0, 2),
      needsAttention: {
        unreadChannels: unreadChannels.slice(0, 6),
        approvalThreads,
        failedPromotions,
      },
      recentHighlights,
      threadActivity,
      workStatus: {
        active: activeThreads,
      },
      agents: {
        ...agents,
        recentActivity: recentAgentActivity,
      },
      channels,
    });
  } catch (error) {
    console.error("[home/overview] failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
