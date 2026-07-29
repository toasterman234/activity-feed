import { NextResponse } from "next/server";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/subscriptions
 *
 * Return all registered push subscriptions for the operator.
 */
export async function GET() {
  try {
    const userId = "operator";
    const result = await pool.query(
      `SELECT id, device_name, endpoint, created_at, last_used_at
         FROM notification_subscriptions
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId],
    );
    return NextResponse.json({
      ok: true,
      subscriptions: result.rows,
    });
  } catch (error) {
    console.error("list subscriptions error:", error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 },
    );
  }
}
