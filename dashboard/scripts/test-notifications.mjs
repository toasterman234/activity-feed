#!/usr/bin/env node
/**
 * Smoke test for notification subsystem.
 *
 * Tests: outbox insert idempotency, delivery flow stub, inbox read/write,
 * preferences enforcement.
 *
 * Usage: node scripts/test-notifications.mjs
 */

import pg from "pg";
import { randomUUID } from "crypto";

const { Client } = pg;
const connectionString =
  process.env.ACTIVITY_DB_URL ||
  "postgres://activity:activity@localhost:5433/activity_log";

const USER_ID = "operator";

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  let passed = 0;
  let failed = 0;

  const check = function(name, fn) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
      failed++;
    }
  };

  const checkAsync = async function(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
      failed++;
    }
  };

  try {
    console.log("=== Notification Smoke Tests ===\n");

    // 1. Outbox idempotency
    const srcId = `test-${randomUUID()}`;
    const outboxId = randomUUID();
    const now = new Date().toISOString();

    await client.query("BEGIN");

    // First insert
    await client.query(
      `INSERT INTO notification_outbox (id, event, urgency, thread_id, channel_id,
         title, body, app_url, source_event_id, actor, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)`,
      [outboxId, "test.smoke", "low", "test", "test", "Smoke Test", "Testing...", "/", srcId, "smoke", now],
    );

    // Second insert with same (source_event_id, event) — should be idempotent
    await client.query(
      `INSERT INTO notification_outbox (id, event, urgency, thread_id, channel_id,
         title, body, app_url, source_event_id, actor, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
       ON CONFLICT (source_event_id, event) DO NOTHING`,
      [randomUUID(), "test.smoke", "low", "test", "test", "Smoke Test", "Testing...", "/", srcId, "smoke", now],
    );

    const countRes = await client.query(
      `SELECT COUNT(*) AS c FROM notification_outbox WHERE source_event_id = $1 AND event = $2`,
      [srcId, "test.smoke"],
    );
    check("outbox idempotency (only one row for same event+source)", () => {
      if (Number(countRes.rows[0].c) !== 1) throw new Error(`expected 1, got ${countRes.rows[0].c}`);
    });

    await client.query("ROLLBACK"); // Don't persist test data

    // 2. Inbox CRUD
    await client.query("BEGIN");
    const inboxOutboxId = randomUUID();
    const inboxSrcId = `test-inbox-${randomUUID()}`;

    await client.query(
      `INSERT INTO notification_outbox (id, event, urgency, thread_id, channel_id,
         title, body, app_url, source_event_id, status, created_at)
       VALUES ($1, 'test.inbox', 'normal', 'test', 'test',
         'Inbox Test', 'Body', '/', $2, 'pending', $3)`,
      [inboxOutboxId, inboxSrcId, now],
    );

    const inboxId = randomUUID();
    await client.query(
      `INSERT INTO notification_inbox (id, user_id, outbox_id, read, dismissed, created_at)
       VALUES ($1, $2, $3, false, false, $4)`,
      [inboxId, USER_ID, inboxOutboxId, now],
    );

    // Read inbox
    const inboxRes = await client.query(
      `SELECT id FROM notification_inbox WHERE user_id = $1 AND read = false AND dismissed = false`,
      [USER_ID],
    );
    check("inbox read (unread notification present)", () => {
      if (inboxRes.rows.length === 0) throw new Error("expected at least 1 unread notification");
    });

    // Mark read
    await client.query(
      `UPDATE notification_inbox SET read = true, read_at = $2 WHERE id = $1`,
      [inboxId, now],
    );
    const readRes = await client.query(
      `SELECT read FROM notification_inbox WHERE id = $1`,
      [inboxId],
    );
    check("inbox mark-read", () => {
      if (!readRes.rows[0].read) throw new Error("expected read=true");
    });

    // Dismiss
    await client.query(
      `UPDATE notification_inbox SET dismissed = true, dismissed_at = $2 WHERE id = $1`,
      [inboxId, now],
    );
    const dismissedRes = await client.query(
      `SELECT dismissed FROM notification_inbox WHERE id = $1`,
      [inboxId],
    );
    check("inbox dismiss", () => {
      if (!dismissedRes.rows[0].dismissed) throw new Error("expected dismissed=true");
    });

    await client.query("ROLLBACK");

    // 3. Preferences scope uniqueness
    await client.query("BEGIN");
    const prefId1 = randomUUID();
    await client.query(
      `INSERT INTO notification_preferences (id, user_id, scope, scope_value, enabled, delivery_mode, created_at, updated_at)
       VALUES ($1, $2, 'event_type', 'work_run.completed', false, 'immediate', $3, $3)
       ON CONFLICT (user_id, scope, scope_value) DO UPDATE SET enabled = false`,
      [prefId1, USER_ID, now],
    );
    const prefId2 = randomUUID();
    await client.query(
      `INSERT INTO notification_preferences (id, user_id, scope, scope_value, enabled, delivery_mode, created_at, updated_at)
       VALUES ($1, $2, 'event_type', 'work_run.completed', true, 'immediate', $3, $3)
       ON CONFLICT (user_id, scope, scope_value) DO UPDATE SET enabled = true`,
      [prefId2, USER_ID, now],
    );
    const prefCount = await client.query(
      `SELECT COUNT(*) AS c FROM notification_preferences WHERE user_id = $1 AND scope = 'event_type' AND scope_value = 'work_run.completed'`,
      [USER_ID],
    );
    check("preferences scope uniqueness (one per user+scope+scope_value)", () => {
      if (Number(prefCount.rows[0].c) !== 1) throw new Error(`expected 1, got ${prefCount.rows[0].c}`);
    });
    await client.query("ROLLBACK");

    // 4. Subscription endpoint uniqueness
    await client.query("BEGIN");
    const subId1 = randomUUID();
    const endpoint = `https://example.com/push/${randomUUID()}`;
    await client.query(
      `INSERT INTO notification_subscriptions (id, user_id, device_name, endpoint, p256dh, auth, created_at, last_used_at)
       VALUES ($1, $2, 'Test', $3, 'key', 'auth', $4, $4)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = 'key', auth = 'auth'`,
      [subId1, USER_ID, endpoint, now],
    );
    // Insert again with different ID but same endpoint
    await client.query(
      `INSERT INTO notification_subscriptions (id, user_id, device_name, endpoint, p256dh, auth, created_at, last_used_at)
       VALUES ($1, $2, 'Test2', $3, 'key2', 'auth2', $4, $4)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, device_name = EXCLUDED.device_name, last_used_at = EXCLUDED.last_used_at`,
      [randomUUID(), USER_ID, endpoint, now],
    );
    const subCount = await client.query(
      `SELECT COUNT(*) AS c FROM notification_subscriptions WHERE endpoint = $1`,
      [endpoint],
    );
    check("subscriptions endpoint uniqueness", () => {
      if (Number(subCount.rows[0].c) !== 1) throw new Error(`expected 1, got ${subCount.rows[0].c}`);
    });
    await client.query("ROLLBACK");

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    await client.query("ROLLBACK").catch(function() {});
    console.error("fatal:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
