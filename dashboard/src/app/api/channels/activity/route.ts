import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";
import { stateKind, type StateKind } from "@/app/channels/lifecycles";

export type ChannelPulse = {
  author: string;
  snippet: string;
  createdAt: string;
};

export type ChannelActivity = {
  channelId: string;
  unreadCount: number;
  states: { start: number; active: number; wait: number; proven: number };
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

    const byChannel = new Map<string, ChannelActivity>();

    for (const row of unreadRes.rows) {
      byChannel.set(row.channel_id, {
        channelId: row.channel_id,
        unreadCount: Number(row.unread_count) || 0,
        states: EMPTY_STATES(),
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
          states: EMPTY_STATES(),
          lastPulse: null,
        };
        byChannel.set(row.channel_id, entry);
      }
      entry.states[kind as keyof ChannelActivity["states"]] += 1;
    }

    for (const row of pulseRes.rows) {
      let entry = byChannel.get(row.channel_id);
      if (!entry) {
        entry = {
          channelId: row.channel_id,
          unreadCount: 0,
          states: EMPTY_STATES(),
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
