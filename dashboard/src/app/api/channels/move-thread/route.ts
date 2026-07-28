import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    threadId,
    fromChannelId,
    toChannelId,
    actor,
  } = body as {
    threadId?: string;
    fromChannelId?: string;
    toChannelId?: string;
    actor?: string;
  };

  if (!threadId || !fromChannelId || !toChannelId) {
    return NextResponse.json(
      { error: "threadId, fromChannelId, and toChannelId required" },
      { status: 400 },
    );
  }
  if (fromChannelId === toChannelId) {
    return NextResponse.json({ error: "already in destination channel" }, { status: 409 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const root = await client.query(
      `SELECT id, channel_id FROM messages
        WHERE id = $1 AND thread_id IS NULL`,
      [threadId],
    );
    if (!root.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "thread not found" }, { status: 404 });
    }
    if (root.rows[0].channel_id !== fromChannelId) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: "thread is not in fromChannelId",
          actualChannelId: root.rows[0].channel_id,
        },
        { status: 409 },
      );
    }

    const dest = await client.query(`SELECT id, name FROM channels WHERE id = $1`, [toChannelId]);
    if (!dest.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "destination channel not found" }, { status: 404 });
    }

    const fromCh = await client.query(`SELECT name FROM channels WHERE id = $1`, [fromChannelId]);
    const fromName = (fromCh.rows[0]?.name as string) || fromChannelId;
    const toName = (dest.rows[0].name as string) || toChannelId;

    const meta = await client.query(
      `SELECT archived_at FROM thread_meta WHERE thread_id = $1`,
      [threadId],
    );
    if (meta.rows[0]?.archived_at) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "thread is archived" }, { status: 409 });
    }

    const promo = await client.query(
      `SELECT status FROM thread_promotions
        WHERE thread_id = $1 AND status = 'running'
        LIMIT 1`,
      [threadId],
    );
    if (promo.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "promotion in progress" }, { status: 409 });
    }

    const now = new Date().toISOString();

    await client.query(
      `UPDATE messages
          SET channel_id = $1
        WHERE channel_id = $2
          AND (id = $3 OR thread_id = $3)`,
      [toChannelId, fromChannelId, threadId],
    );

    await client.query(
      `UPDATE thread_meta
          SET channel_id = $1, updated_at = $2
        WHERE thread_id = $3`,
      [toChannelId, now, threadId],
    );

    // If meta row missing (lifecycle not picked), still moved messages — OK.
    await client.query(
      `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
       VALUES ($1, $2, $3, 'system', $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        randomUUID(),
        toChannelId,
        threadId,
        `Moved from #${fromName} → #${toName} (${actor || "you"})`,
        now,
      ],
    );

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      threadId,
      fromChannelId,
      toChannelId,
      fromName,
      toName,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[channels/move-thread] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
