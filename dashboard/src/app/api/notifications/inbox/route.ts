import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

const USER_ID = "operator";

/**
 * GET /api/notifications/inbox
 *
 * List in-app notifications with pagination and unread count.
 * Query params:
 *   ?status=unread|all (default: all)
 *   ?limit=20
 *   ?before=<created_at> for cursor-based pagination
 */
export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status") || "all";
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 20, 50);
    const before = req.nextUrl.searchParams.get("before")?.trim() || null;

    let whereClause = "ni.user_id = $1";
    const params: unknown[] = [USER_ID];
    let idx = 2;

    if (status === "unread") {
      whereClause += " AND ni.read = false AND ni.dismissed = false";
    } else if (status === "dismissed") {
      whereClause += " AND ni.dismissed = true";
    }

    if (before) {
      whereClause += ` AND ni.created_at < $${idx}`;
      params.push(before);
      idx++;
    }

    params.push(limit);

    const result = await pool.query(
      `SELECT ni.id, ni.user_id, ni.outbox_id, ni.read, ni.dismissed,
              ni.created_at, ni.read_at, ni.dismissed_at,
              no2.event, no2.urgency, no2.thread_id, no2.channel_id,
              no2.title, no2.body, no2.app_url, no2.actor
         FROM notification_inbox ni
         JOIN notification_outbox no2 ON no2.id = ni.outbox_id
        WHERE ${whereClause}
        ORDER BY ni.created_at DESC
        LIMIT $${idx}`,
      params,
    );

    // Unread count
    const countResult = await pool.query(
      `SELECT COUNT(*) AS unread
         FROM notification_inbox
        WHERE user_id = $1 AND read = false AND dismissed = false`,
      [USER_ID],
    );
    const unreadCount = Number(countResult.rows[0]?.unread) || 0;

    return NextResponse.json({
      ok: true,
      unreadCount,
      notifications: result.rows,
      hasMore: result.rows.length === limit,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * PUT /api/notifications/inbox
 *
 * Mark notifications as read or dismissed.
 * Body: { action: "read" | "dismiss" | "read-all", ids?: string[] }
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const action = String(body?.action || "");

    if (action === "read-all") {
      await pool.query(
        `UPDATE notification_inbox SET read = true, read_at = $2
          WHERE user_id = $1 AND read = false`,
        [USER_ID, new Date().toISOString()],
      );
      return NextResponse.json({ ok: true });
    }

    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "ids required" }, { status: 400 });
    }

    if (action === "read") {
      await pool.query(
        `UPDATE notification_inbox SET read = true, read_at = $3
          WHERE user_id = $1 AND id = ANY($2::text[])`,
        [USER_ID, ids, new Date().toISOString()],
      );
    } else if (action === "dismiss") {
      await pool.query(
        `UPDATE notification_inbox SET dismissed = true, dismissed_at = $3
          WHERE user_id = $1 AND id = ANY($2::text[])`,
        [USER_ID, ids, new Date().toISOString()],
      );
    } else {
      return NextResponse.json({ ok: false, error: "action must be read or dismiss" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
