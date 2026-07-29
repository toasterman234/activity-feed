#!/usr/bin/env node
/**
 * Notification delivery worker.
 *
 * Polls notification_outbox for pending notifications, evaluates preferences,
 * and dispatches push messages to all subscribed devices via web-push.
 *
 * Designed to run as a systemd timer (every 30s) or one-shot process.
 * Usage: node scripts/deliver-notifications.mjs
 */

import pg from "pg";
import { randomUUID } from "crypto";

const { Client } = pg;

const connectionString =
  process.env.ACTIVITY_DB_URL ||
  "postgres://activity:activity@localhost:5433/activity_log";

const USER_ID = "operator";

async function loadWebPush() {
  try {
    const mod = await import("web-push");
    return mod.default || mod;
  } catch {
    console.error("[notifications] web-push not installed");
    process.exit(1);
  }
}

function getVapidSubject() {
  return process.env.VAPID_SUBJECT || "mailto:admin@bcharney.com";
}

async function deliver() {
  const client = new Client({ connectionString });
  const webpush = await loadWebPush();

  try {
    await client.connect();

    const pubKey = process.env.VAPID_PUBLIC_KEY;
    const privKey = process.env.VAPID_PRIVATE_KEY;
    if (!pubKey || !privKey) {
      console.log("[notifications] VAPID not configured — skipping delivery");
      return;
    }
    webpush.setVapidDetails(getVapidSubject(), pubKey, privKey);

    const pending = await client.query(
      `SELECT id, event, urgency, thread_id, channel_id, title, body, app_url,
              source_event_id, actor, status, created_at
         FROM notification_outbox
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 20`,
    );

    if (pending.rows.length === 0) {
      console.log("[notifications] no pending messages");
      return;
    }

    console.log(`[notifications] processing ${pending.rows.length} pending message(s)`);

    const prefs = await client.query(
      `SELECT scope, scope_value, enabled, delivery_mode,
              quiet_hours_start, quiet_hours_end
         FROM notification_preferences
        WHERE user_id = $1`,
      [USER_ID],
    );

    const globalPref = prefs.rows.find(function(r) {
      return r.scope === "global" && r.scope_value == null;
    });
    const globalEnabled = globalPref ? globalPref.enabled : true;

    const eventEnabled = {};
    for (const row of prefs.rows) {
      if (row.scope === "event_type" && row.scope_value) {
        eventEnabled[row.scope_value] = row.enabled;
      }
    }

    // Check quiet hours
    const qStart = globalPref?.quiet_hours_start;
    const qEnd = globalPref?.quiet_hours_end;
    let inQuietHours = false;
    if (qStart && qEnd) {
      const now = new Date();
      const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
      const sParts = qStart.split(":").map(Number);
      const eParts = qEnd.split(":").map(Number);
      const startMins = sParts[0] * 60 + sParts[1];
      const endMins = eParts[0] * 60 + eParts[1];
      inQuietHours = startMins < endMins
        ? (nowMins >= startMins && nowMins < endMins)
        : (nowMins >= startMins || nowMins < endMins);
    }

    const subs = await client.query(
      `SELECT id, endpoint, p256dh, auth, device_name
         FROM notification_subscriptions
        WHERE user_id = $1`,
      [USER_ID],
    );

    if (subs.rows.length === 0) {
      for (const msg of pending.rows) {
        await client.query(
          `UPDATE notification_outbox SET status = 'skipped', processed_at = $2 WHERE id = $1`,
          [msg.id, new Date().toISOString()],
        );
      }
      console.log("[notifications] no subscriptions — all skipped");
      return;
    }

    console.log(`[notifications] ${subs.rows.length} subscription(s) registered`);

    const now = new Date().toISOString();
    let dispatched = 0;
    let skipped = 0;
    let blocked = 0;
    let failed = 0;

    for (const msg of pending.rows) {
      const evEnabled = eventEnabled[msg.event] !== undefined ? eventEnabled[msg.event] : true;
      if (!globalEnabled || !evEnabled) {
        await client.query(
          `UPDATE notification_outbox SET status = 'preference_blocked', processed_at = $2 WHERE id = $1`,
          [msg.id, now],
        );
        blocked++;
        continue;
      }

      if (inQuietHours) {
        skipped++;
        continue;
      }

      let anySent = false;
      for (const sub of subs.rows) {
        const deliveryId = randomUUID();
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify({
              title: msg.title,
              body: msg.body,
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              data: {
                app_url: msg.app_url,
                urgency: msg.urgency,
                tag: "msg-" + msg.id,
                thread_id: msg.thread_id,
                event: msg.event,
              },
            }),
          );

          await client.query(
            `INSERT INTO notification_deliveries (id, outbox_id, subscription_id, attempt, status, created_at, completed_at)
             VALUES ($1, $2, $3, 1, 'sent', $4, $4)`,
            [deliveryId, msg.id, sub.id, now],
          );

          await client.query(
            `UPDATE notification_subscriptions SET last_used_at = $2 WHERE id = $1`,
            [sub.id, now],
          );

          anySent = true;
          dispatched++;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          const isGone =
            errMsg.includes("unsubscribed") ||
            errMsg.includes("expired") ||
            errMsg.includes("NotRegistered") ||
            errMsg.includes("InvalidToken") ||
            (error.statusCode === 410);

          await client.query(
            `INSERT INTO notification_deliveries (id, outbox_id, subscription_id, attempt, status, error_detail, created_at, completed_at)
             VALUES ($1, $2, $3, 1, $4, $5, $6, $6)`,
            [deliveryId, msg.id, sub.id, isGone ? "invalid_subscription" : "failed", errMsg.slice(0, 500), now],
          );

          if (isGone) {
            await client.query(
              `DELETE FROM notification_subscriptions WHERE id = $1`,
              [sub.id],
            );
            console.log(`[notifications] removed invalid subscription: ${sub.device_name}`);
          }

          anySent = true;
          failed++;
        }
      }

      if (anySent) {
        await client.query(
          `UPDATE notification_outbox SET status = 'dispatched', processed_at = $2 WHERE id = $1`,
          [msg.id, now],
        );
      } else {
        skipped++;
      }
    }

    console.log(
      `[notifications] done: dispatched=${dispatched} failed=${failed} blocked=${blocked} skipped=${skipped}`,
    );
  } catch (error) {
    console.error("[notifications] delivery error:", error.message);
    throw error;
  } finally {
    await client.end();
  }
}

deliver().catch(function(error) {
  console.error("[notifications] fatal:", error.message);
  process.exit(1);
});
