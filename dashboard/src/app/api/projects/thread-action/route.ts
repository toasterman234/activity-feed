import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const repoId = String(body?.repoId || "").trim();
    const threadId = String(body?.threadId || "").trim();
    const action = String(body?.action || "").trim();
    if (!repoId || !threadId || !action) {
      return NextResponse.json({ error: "repoId, threadId, and action are required" }, { status: 400 });
    }
    if (action !== "archive" && action !== "makePrimary") {
      return NextResponse.json({ error: `unsupported action: ${action}` }, { status: 400 });
    }

    const metaRes = await pool.query(
      `SELECT thread_id, channel_id, lifecycle, state, repo_id, archived_at
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
      repo_id: string | null;
      archived_at: string | null;
    } | undefined;
    if (!meta || meta.repo_id !== repoId) {
      return NextResponse.json({ error: "thread not found for repo" }, { status: 404 });
    }
    if (meta.lifecycle !== "issue") {
      return NextResponse.json({ error: "only issue threads can be managed from Projects" }, { status: 409 });
    }

    const now = new Date().toISOString();
    if (action === "archive") {
      if (meta.archived_at) {
        return NextResponse.json({ ok: true, archived: true });
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
         VALUES ($1, $2, $3, 'system', $4, $5)`,
        [
          randomUUID(),
          meta.channel_id,
          threadId,
          "Archived from project detail.",
          now,
        ],
      );
      return NextResponse.json({ ok: true, archived: true });
    }

    if (meta.archived_at) {
      return NextResponse.json({ error: "archived threads cannot be made primary" }, { status: 409 });
    }
    if (meta.state === "closed" || meta.state === "wont_fix") {
      return NextResponse.json({ error: `thread state ${meta.state} cannot be made primary` }, { status: 409 });
    }

    await pool.query(
      `UPDATE thread_meta
          SET updated_at = $1
        WHERE thread_id = $2`,
      [now, threadId],
    );
    await pool.query(
      `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
       VALUES ($1, $2, $3, 'system', $4, $5)`,
      [
        randomUUID(),
        meta.channel_id,
        threadId,
        "Marked as the primary active work thread from project detail.",
        now,
      ],
    );
    return NextResponse.json({ ok: true, primary: true });
  } catch (err) {
    console.error("[projects/thread-action] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
