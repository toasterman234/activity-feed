#!/usr/bin/env node
/**
 * Notification delivery worker.
 *
 * Polls notification_outbox for pending notifications, evaluates preferences,
 * and dispatches push messages to all subscribed devices via web-push.
 *
 * Designed to run as a systemd timer (every 30s) or one-shot process.
 * Usage: node scripts/deliver-notifications.mjs
 *
 * Environment:
 *   ACTIVITY_DB_URL — Postgres connection (default: postgres://activity:activity@localhost:5433/activity_log)
 *   VAPID_PUBLIC_KEY — raw 65-byte uncompressed EC point (base64url)
 *   VAPID_PRIVATE_KEY — raw 32-byte scalar (base64url)
 *   VAPID_SUBJECT — mailto: URL (default: mailto:admin@bcharney.com)
 */

import pg from "pg";
import { randomUUID } from "crypto";

const { Client } = pg;

const connectionString =
  process.env.ACTIVITY_DB_URL ||
  "postgres://activity:activity@localhost:5433/activity_log";

const USER_ID = "operator";

async function loadWebPush(): Promise<typeof import("web-push")> {
  try {
    return await import("web-push");
  } catch {
    console.error("[notifications] web-push not installed; run: npm install web-push");
    process.exit(1);
  }
}

function getVapidSubject(): string {
  return process.env.VAPID_SUBJECT || "mailto:admin@bcharney.com";
}

async function deliver() {
  const client = new Client({ connectionString });
  const webpush = await loadWebPush();

  try {
    await client.connect();

    // Check VAPID config
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      console.log("[notifications] VAPID not configured — skipping delivery");
      return;
    }
    webpush.setVapidDetails(getVapidSubject(), publicKey, privateKey);

    // 1. Get pending messages (max 20 per run)
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

    // 2. Load global + event-type preferences for the user
    const prefs = await client.query(
      `SELECT scope, scope_value, enabled, delivery_mode,
              quiet_hours_start, quiet_hours_end
         FROM notification_preferences
        WHERE user_id = $1`,
      [USER_ID],
    );

    const globalEnabled = Boolean(
      prefs.rows.find(
        (r: any) => r.scope === "global" && r.scope_value == null && r.enabled,
      )?.enabled ?? true, // default: enabled if no global record
    );

    // Build event-type enabled map
    const eventEnabled: Record<string, boolean> = {};
    for (const row of prefs.rows) {
      if (row.scope === "event_type" && row.scope_value) {
        eventEnabled[row.scope_value] = row.enabled;
      }
      // Also handle explicit global disable
      if (row.scope === "global" && row.scope_value == null) {
        // captured above
      }
    }

    // 3. Load all active subscriptions
    const subs = await client.query(
      `SELECT id, endpoint, p256dh, auth, device_name
         FROM notification_subscriptions
        WHERE user_id = $1`,
      [USER_ID],
    );

    if (subs.rows.length === 0) {
      // No subscriptions — mark all pending as skipped
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

    // 4. Process each message
    const now = new Date().toISOString();
    let dispatched = 0;
    let skipped = 0;
    let blocked = 0;
    let failed = 0;

    for (const msg of pending.rows) {
      // Check preferences
      const evEnabled = eventEnabled[msg.event] ?? true; // default: enabled
      if (!globalEnabled || !evEnabled) {
        await client.query(
          `UPDATE notification_outbox SET status = 'preference_blocked', processed_at = $2 WHERE id = $1`,
          [msg.id, now],
        );
        blocked++;
        continue;
      }

      // Check quiet hours (simplified — UTC only for now)
      const quietStart = prefs.rows.find(
        (r: any) => r.scope === "global" && r.scope_value == null && r.quiet_hours_start,
      )?.quiet_hours_start;
      const quietEnd = prefs.rows.find(
        (r: any) => r.scope === "global" && r.scope_value == null && r.quiet_hours_end,
      )?.quiet_hours_end;
      if (quietStart && quietEnd) {
        const nowTime = new Date();
        const nowMinutes = nowTime.getUTCHours() * 60 + nowTime.getUTCMinutes();
        const [startH, startM] = (quietStart as string).split(":").map(Number);
        const [endH, endM] = (quietEnd as string).split(":").map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;
        const inQuietHours = startMin < endMin
          ? nowMinutes >= startMin && nowMinutes < endMin
          : nowMinutes >= startMin || nowMinutes < endMin; // overnight range
        if (inQuietHours) {
          skipped++;
          continue; // leave as pending for next run after quiet hours
        }
      }

      // Dispatch to each subscription
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
                tag: `msg-${msg.id}`,
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

          // Update last_used_at
          await client.query(
            `UPDATE notification_subscriptions SET last_used_at = $2 WHERE id = $1`,
            [sub.id, now],
          );

          anySent = true;
          dispatched++;
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);

          // Check for expired/invalid subscriptions
          const isGone =
            errMsg.includes("unsubscribed") ||
            errMsg.includes("expired") ||
            errMsg.includes("NotRegistered") ||
            errMsg.includes("InvalidToken") ||
            (error as any)?.statusCode === 410;

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

      // Mark outbox as dispatched if at least one delivery attempted
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
    console.error("[notifications] delivery error:", (error as Error).message);
    throw error;
  } finally {
    await client.end();
  }
}

deliver().catch((error) => {
  console.error("[notifications] fatal:", (error as Error).message);
  process.exit(1);
});
