import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";
import { stateKind, type StateKind } from "@/app/channels/lifecycles";

export type ChannelPulse = {
  author: string;
  snippet: string;
  createdAt: string;
};

export type WaitingPreview = {
  threadId: string;
  title: string;
  reason: "unread" | "wait";
  updatedAt: string;
};

export type ChannelActivity = {
  channelId: string;
  unreadCount: number;
  threadCount: number;
  states: { start: number; active: number; wait: number; proven: number };
  waitingPreview: WaitingPreview[];
  lastPulse: ChannelPulse | null;
};

const EMPTY_STATES = (): ChannelActivity["states"] => ({
  start: 0, active: 0, wait: 0, proven: 0,
});

const ROLLUP_KINDS = new Set<StateKind>(["start", "active", "wait", "proven"]);

function snippetFromBody(body: string, max = 80): string {
  const one = (body || "").replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

export async function GET(req: NextRequest) {
  const viewer = req.nextUrl.searchParams.get("viewer") || "you";

  try {
    const [unreadRes, metaRes, pulseRes] = await Promise.all([
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

    // Thread counts per channel
    const threadCountRes = await pool.query<{ channel_id: string; thread_count: string }>(
      `SELECT channel_id, COUNT(*)::int AS thread_count
       FROM thread_meta
       WHERE archived_at IS NULL
       GROUP BY channel_id`,
    );
    const threadCountByChannel = new Map<string, number>();
    for (const row of threadCountRes.rows) {
      threadCountByChannel.set(row.channel_id, Number(row.thread_count) || 0);
    }

    // Waiting previews: threads in 'wait' state or with unread messages, ordered by recency
    const waitingRes = await pool.query<{
      channel_id: string; thread_id: string; title: string;
      reason: string; updated_at: string;
    }>(
      `SELECT tm.channel_id, tm.thread_id,
              COALESCE(
                (SELECT split_part(m.body, E'\n', 1) FROM messages m WHERE m.id = tm.thread_id),
                'Untitled'
              ) AS title,
              CASE
                WHEN (SELECT COUNT(*) FROM messages m2
                      WHERE m2.thread_id = tm.thread_id AND m2.created_at > COALESCE(
                        (SELECT last_read_at FROM channel_read_state rs WHERE rs.channel_id = tm.channel_id AND rs.viewer_id = $1),
                        '1970-01-01'
                      )) > 0 THEN 'unread'
                ELSE 'wait'
              END AS reason,
              tm.updated_at
       FROM thread_meta tm
       WHERE tm.archived_at IS NULL
         AND (tm.state = 'wait' OR tm.state = 'review'
              OR EXISTS (
                SELECT 1 FROM messages m3
                WHERE m3.thread_id = tm.thread_id AND m3.author IS DISTINCT FROM $1
                  AND m3.created_at > COALESCE(
                    (SELECT last_read_at FROM channel_read_state rs2 WHERE rs2.channel_id = tm.channel_id AND rs2.viewer_id = $1),
                    '1970-01-01'
                  )
              ))
       ORDER BY tm.updated_at DESC
       LIMIT 50`,
      [viewer],
    );
    const waitingByChannel = new Map<string, WaitingPreview[]>();
    for (const row of waitingRes.rows) {
      const existing = waitingByChannel.get(row.channel_id) || [];
      if (existing.length < 2) {
        existing.push({
          threadId: row.thread_id,
          title: row.title,
          reason: row.reason as "unread" | "wait",
          updatedAt: row.updated_at,
        });
        waitingByChannel.set(row.channel_id, existing);
      }
    }

    const byChannel = new Map<string, ChannelActivity>();

    for (const row of unreadRes.rows) {
      byChannel.set(row.channel_id, {
        channelId: row.channel_id,
        unreadCount: Number(row.unread_count) || 0,
        threadCount: threadCountByChannel.get(row.channel_id) || 0,
        states: EMPTY_STATES(),
        waitingPreview: [],
        lastPulse: null,
      });
    }

    for (const row of metaRes.rows) {
      const kind = stateKind(row.lifecycle, row.state);
      if (!kind || !ROLLUP_KINDS.has(kind)) continue;
      let entry = byChannel.get(row.channel_id);
      if (!entry) {
        entry = {
          channelId: row.channel_id,
          unreadCount: 0,
          threadCount: threadCountByChannel.get(row.channel_id) || 0,
          states: EMPTY_STATES(),
          waitingPreview: [],
          lastPulse: null,
        };
        byChannel.set(row.channel_id, entry);
      }
      entry.states[kind as keyof ChannelActivity["states"]] += 1;
    }

    // Attach waiting previews
    for (const [channelId, previews] of waitingByChannel) {
      let entry = byChannel.get(channelId);
      if (!entry) {
        entry = {
          channelId,
          unreadCount: 0,
          threadCount: threadCountByChannel.get(channelId) || 0,
          states: EMPTY_STATES(),
          waitingPreview: [],
          lastPulse: null,
        };
        byChannel.set(channelId, entry);
      }
      entry.waitingPreview = previews;
    }

    for (const row of pulseRes.rows) {
      let entry = byChannel.get(row.channel_id);
      if (!entry) {
        entry = {
          channelId: row.channel_id,
          unreadCount: 0,
          threadCount: threadCountByChannel.get(row.channel_id) || 0,
          states: EMPTY_STATES(),
          waitingPreview: [],
          lastPulse: null,
        };
        byChannel.set(row.channel_id, entry);
      }
      entry.lastPulse = {
        author: row.author,
        snippet: snippetFromBody(row.body),
        createdAt: row.created_at,
      };
    }

    return NextResponse.json({ channels: [...byChannel.values()] });
  } catch (err) {
    console.error("[channels/activity] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
