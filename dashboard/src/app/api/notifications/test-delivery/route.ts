import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import webpush from "web-push";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

function getVapidKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@bcharney.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID not configured");
  }
  return { publicKey, privateKey, subject };
}

/**
 * POST /api/notifications/test-delivery
 *
 * Send a test push to all registered subscriptions for the operator.
 * Used by the "Enable notifications" UI to confirm delivery works
 * after subscription.
 */
export async function POST() {
  try {
    const { publicKey, privateKey, subject } = getVapidKeys();
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const userId = "operator";
    const result = await pool.query(
      `SELECT id, endpoint, p256dh, auth
         FROM notification_subscriptions
        WHERE user_id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No registered subscriptions" },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();
    const outboxId = randomUUID();

    // Write a test outbox entry
    await pool.query(
      `INSERT INTO notification_outbox (id, event, urgency, thread_id, channel_id,
         title, body, app_url, source_event_id, actor, status, created_at)
       VALUES ($1, 'test.delivery', 'low', 'test', 'test',
         'Test Notification', 'Push notifications are working!', '/',
         $2, 'test', 'dispatched', $3)
       ON CONFLICT DO NOTHING`,
      [outboxId, outboxId, now],
    );

    const results: Array<{
      subscriptionId: string;
      status: string;
      error?: string;
    }> = [];

    for (const sub of result.rows) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify({
            title: "🔔 Activity Dashboard",
            body: "Push notifications are working!",
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            data: {
              app_url: "/",
              urgency: "low",
              tag: "test-delivery",
            },
          }),
        );

        // Record delivery
        await pool.query(
          `INSERT INTO notification_deliveries (id, outbox_id, subscription_id, attempt, status, created_at, completed_at)
           VALUES ($1, $2, $3, 1, 'sent', $4, $4)`,
          [randomUUID(), outboxId, sub.id, now],
        );
        results.push({ subscriptionId: sub.id, status: "sent" });
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        results.push({ subscriptionId: sub.id, status: "failed", error: errMsg });

        if (errMsg.includes("unsubscribed") || errMsg.includes("expired") || errMsg.includes("NotRegistered")) {
          await pool.query(
            `DELETE FROM notification_subscriptions WHERE id = $1`,
            [sub.id],
          );
        }
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("test-delivery error:", error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 },
    );
  }
}
