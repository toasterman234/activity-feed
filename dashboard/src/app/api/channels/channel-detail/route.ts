import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

function snippetFromBody(body: string, max = 140): string {
  const one = (body || "").replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

export async function GET(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get("channelId")?.trim();
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";
  const viewer = req.nextUrl.searchParams.get("viewer")?.trim() || "you";
  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  try {
    const [channelRes, threadsRes] = await Promise.all([
      pool.query(`SELECT id, name FROM channels WHERE id = $1 LIMIT 1`, [channelId]),
      pool.query(
        `SELECT
           tm.thread_id,
           tm.channel_id,
           COALESCE(split_part(root.body, E'\n', 1), 'Untitled') AS title,
           tm.lifecycle,
           tm.state,
           tm.assignee,
           tm.repo_id,
           r.name AS repo_name,
           tm.promoted_to,
           tm.archived_at,
           tm.updated_at,
           COALESCE(stats.reply_count, 0)::int AS reply_count,
           stats.last_author,
           stats.last_message_at,
           stats.last_body,
           COALESCE(unread_stats.unread_reply_count, 0)::int AS unread_reply_count
         FROM thread_meta tm
         LEFT JOIN messages root ON root.id = tm.thread_id
         LEFT JOIN repos r ON r.id = tm.repo_id
         LEFT JOIN channel_read_state rs ON rs.channel_id = tm.channel_id AND rs.viewer_id = $2
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int AS reply_count,
             (ARRAY_AGG(m.author ORDER BY m.created_at DESC))[1] AS last_author,
             MAX(m.created_at) AS last_message_at,
             (ARRAY_AGG(m.body ORDER BY m.created_at DESC))[1] AS last_body
           FROM messages m
           WHERE m.thread_id = tm.thread_id
         ) stats ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS unread_reply_count
           FROM messages m
           WHERE m.thread_id = tm.thread_id
             AND m.author IS DISTINCT FROM $2
             AND m.created_at > COALESCE(rs.last_read_at, '1970-01-01T00:00:00.000Z')
         ) unread_stats ON true
         WHERE tm.channel_id = $1
           AND ($3::boolean = true OR tm.archived_at IS NULL)
         ORDER BY (tm.archived_at IS NULL) DESC,
                  COALESCE(unread_stats.unread_reply_count, 0) DESC,
                  COALESCE(stats.last_message_at, tm.updated_at) DESC NULLS LAST,
                  tm.thread_id DESC`,
        [channelId, viewer, includeArchived],
      ),
    ]);

    return NextResponse.json({
      channel: channelRes.rows[0] || { id: channelId, name: channelId },
      threads: threadsRes.rows.map((row) => ({
        threadId: String(row.thread_id),
        channelId: String(row.channel_id),
        title: String(row.title || "Untitled"),
        lifecycle: row.lifecycle ? String(row.lifecycle) : null,
        state: row.state ? String(row.state) : null,
        assignee: row.assignee ? String(row.assignee) : null,
        repoId: row.repo_id ? String(row.repo_id) : null,
        repoName: row.repo_name ? String(row.repo_name) : null,
        promotedTo: row.promoted_to ? String(row.promoted_to) : null,
        archivedAt: row.archived_at ? String(row.archived_at) : null,
        updatedAt: row.updated_at ? String(row.updated_at) : null,
        replyCount: Number(row.reply_count) || 0,
        unreadReplyCount: Number(row.unread_reply_count) || 0,
        hasUnread: (Number(row.unread_reply_count) || 0) > 0,
        lastAuthor: row.last_author ? String(row.last_author) : null,
        lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
        lastSnippet: row.last_body ? snippetFromBody(String(row.last_body)) : null,
      })),
    });
  } catch (err) {
    console.error("[channels/channel-detail] GET failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
