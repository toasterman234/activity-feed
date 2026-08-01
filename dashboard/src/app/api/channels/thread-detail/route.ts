import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get("channelId")?.trim();
  const threadId = req.nextUrl.searchParams.get("threadId")?.trim();
  if (!channelId || !threadId) {
    return NextResponse.json({ error: "channelId and threadId required" }, { status: 400 });
  }

  try {
    const [threadRes, repliesRes] = await Promise.all([
      pool.query(
        `SELECT
           m.id AS thread_id,
           m.channel_id,
           c.name AS channel_name,
           m.author AS root_author,
           m.body AS root_body,
           m.created_at,
           tm.lifecycle,
           tm.state,
           tm.assignee,
           tm.repo_id,
           r.name AS repo_name,
           r.path AS repo_path,
           tm.promoted_to,
           tm.archived_at,
           tm.updated_at
         FROM messages m
         LEFT JOIN channels c ON c.id = m.channel_id
         LEFT JOIN thread_meta tm ON tm.thread_id = m.id
         LEFT JOIN repos r ON r.id = tm.repo_id
         WHERE m.id = $1 AND m.channel_id = $2
         LIMIT 1`,
        [threadId, channelId],
      ),
      pool.query(
        `SELECT id, author, body, created_at
           FROM messages
          WHERE thread_id = $1
          ORDER BY created_at ASC`,
        [threadId],
      ),
    ]);

    const row = threadRes.rows[0];
    if (!row) {
      return NextResponse.json({ error: "thread not found" }, { status: 404 });
    }

    const title = String(row.root_body || "").split("\n").find((line: string) => line.trim())?.trim() || "Untitled";

    return NextResponse.json({
      thread: {
        threadId: String(row.thread_id),
        channelId: String(row.channel_id),
        channelName: row.channel_name ? String(row.channel_name) : String(row.channel_id),
        title,
        rootAuthor: row.root_author ? String(row.root_author) : null,
        rootBody: String(row.root_body || ""),
        createdAt: String(row.created_at),
        lifecycle: row.lifecycle ? String(row.lifecycle) : null,
        state: row.state ? String(row.state) : null,
        assignee: row.assignee ? String(row.assignee) : null,
        repoId: row.repo_id ? String(row.repo_id) : null,
        repoName: row.repo_name ? String(row.repo_name) : null,
        repoPath: row.repo_path ? String(row.repo_path) : null,
        promotedTo: row.promoted_to ? String(row.promoted_to) : null,
        archivedAt: row.archived_at ? String(row.archived_at) : null,
        updatedAt: row.updated_at ? String(row.updated_at) : null,
      },
      replies: repliesRes.rows.map((reply) => ({
        id: String(reply.id),
        author: reply.author ? String(reply.author) : null,
        body: String(reply.body || ""),
        createdAt: String(reply.created_at),
      })),
    });
  } catch (err) {
    console.error("[channels/thread-detail] GET failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
