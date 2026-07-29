import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/subscribe
 *
 * Register a device for push notifications. Called after
 * `navigator.serviceWorker.ready.pushManager.subscribe()` succeeds.
 *
 * Body: { subscription: { endpoint, keys: { p256dh, auth } }, deviceName: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.subscription?.endpoint || !body?.subscription?.keys?.p256dh || !body?.subscription?.keys?.auth) {
      return NextResponse.json(
        { ok: false, error: "Missing subscription keys (endpoint, p256dh, auth required)" },
        { status: 400 },
      );
    }

    const { endpoint, keys } = body.subscription;
    const deviceName = String(body.deviceName || "Unnamed device").slice(0, 200);
    const userId = "operator"; // Single operator — harden later with auth

    const id = randomUUID();
    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO notification_subscriptions (id, user_id, device_name, endpoint, p256dh, auth, created_at, last_used_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (endpoint) DO UPDATE SET
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         device_name = EXCLUDED.device_name,
         last_used_at = EXCLUDED.last_used_at`,
      [id, userId, deviceName, endpoint, keys.p256dh, keys.auth, now],
    );

    return NextResponse.json({ ok: true, id, deviceName });
  } catch (error) {
    console.error("subscribe error:", error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/notifications/subscribe
 *
 * Remove a device subscription by endpoint or id.
 * Body: { endpoint: string } or { id: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const userId = "operator";

    if (body?.endpoint) {
      await pool.query(
        `DELETE FROM notification_subscriptions WHERE endpoint = $1 AND user_id = $2`,
        [body.endpoint, userId],
      );
      return NextResponse.json({ ok: true });
    }

    if (body?.id) {
      await pool.query(
        `DELETE FROM notification_subscriptions WHERE id = $1 AND user_id = $2`,
        [body.id, userId],
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: "Provide endpoint or id to remove" },
      { status: 400 },
    );
  } catch (error) {
    console.error("unsubscribe error:", error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 },
    );
  }
}
