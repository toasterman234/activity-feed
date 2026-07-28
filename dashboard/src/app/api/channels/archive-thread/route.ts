import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";
import { writeGraphEvent } from "@/lib/graph-initiatives";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const threadId = String(body?.threadId || "").trim();
    const channelId = String(body?.channelId || "").trim();
    const action = String(body?.action || "archive").trim();
    if (!threadId || !channelId) {
      return NextResponse.json({ error: "threadId and channelId are required" }, { status: 400 });
    }
    if (action !== "archive" && action !== "unarchive") {
      return NextResponse.json({ error: `unsupported action: ${action}` }, { status: 400 });
    }

    const metaRes = await pool.query(
      `SELECT thread_id, channel_id, lifecycle, state, archived_at, promoted_to
         FROM thread_meta
        WHERE thread_id = $1
        LIMIT 1`,
      [threadId],
    );
    const meta = metaRes.rows[0] as {
      thread_id: string;
      channel_id: string;
      lifecycle: string;
      state: string;
      archived_at: string | null;
      promoted_to: string | null;
    } | undefined;
    if (!meta || meta.channel_id !== channelId) {
      return NextResponse.json({ error: "thread not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    if (action === "archive") {
      if (meta.archived_at) {
        return NextResponse.json({ ok: true, archived: true, archivedAt: meta.archived_at });
      }
      await pool.query(
        `UPDATE thread_meta
            SET archived_at = $1,
                updated_at = $1
          WHERE thread_id = $2`,
        [now, threadId],
      );
      await pool.query(
        `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
         VALUES ($1, $2, $3, 'system', $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [randomUUID(), channelId, threadId, "Thread archived.", now],
      );
      await writeGraphEvent({
        channelId,
        threadId,
        kind: "thread.archived",
        actor: "you",
        payload: { lifecycle: meta.lifecycle, state: meta.state },
      }).catch(() => {});
      return NextResponse.json({ ok: true, archived: true, archivedAt: now });
    }

    // unarchive
    if (!meta.archived_at) {
      return NextResponse.json({ ok: true, archived: false });
    }
    await pool.query(
      `UPDATE thread_meta
          SET archived_at = NULL,
              updated_at = $1
        WHERE thread_id = $2`,
      [now, threadId],
    );
    await pool.query(
      `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
       VALUES ($1, $2, $3, 'system', $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [randomUUID(), channelId, threadId, "Thread restored from archive.", now],
    );
    await writeGraphEvent({
      channelId,
      threadId,
      kind: "thread.unarchived",
      actor: "you",
      payload: { lifecycle: meta.lifecycle, state: meta.state },
    }).catch(() => {});
    return NextResponse.json({ ok: true, archived: false });
  } catch (err) {
    console.error("[channels/archive-thread] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
