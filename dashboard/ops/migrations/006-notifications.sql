-- Notification subsystem schema
-- Apply with: ACTIVITY_DB_URL=... node scripts/init-notifications.mjs
-- Rollback: scripts/rollback-notifications.sql

-- 1. Push subscriptions (device tokens per user)
CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,                       -- operator identity
  device_name     TEXT NOT NULL,                       -- user-facing label (e.g. "iPhone 15 Pro")
  endpoint        TEXT NOT NULL,                       -- Web Push endpoint URL
  p256dh          TEXT NOT NULL,                       -- client public key (base64url)
  auth            TEXT NOT NULL,                       -- client auth secret (base64url)
  created_at      TEXT NOT NULL DEFAULT (now()::text),
  last_used_at    TEXT NOT NULL DEFAULT (now()::text),

  -- One subscription per endpoint (endpoint is globally unique per browser profile)
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS notification_subs_user_idx
  ON notification_subscriptions (user_id, created_at DESC);

-- 2. Notification preferences (scoped overrides)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  scope           TEXT NOT NULL DEFAULT 'global'
    CHECK (scope IN ('global', 'event_type', 'channel', 'project', 'workflow', 'agent', 'task')),
  scope_value     TEXT,                                -- event type name, channel_id, repo_id, workflow_id, agent_id, thread_id
  enabled         BOOLEAN NOT NULL DEFAULT true,
  delivery_mode   TEXT NOT NULL DEFAULT 'immediate'
    CHECK (delivery_mode IN ('immediate', 'digest')),
  quiet_hours_start TIME WITHOUT TIME ZONE,            -- e.g. 22:00
  quiet_hours_end   TIME WITHOUT TIME ZONE,            -- e.g. 07:00
  lock_screen_preview BOOLEAN NOT NULL DEFAULT true,
  created_at      TEXT NOT NULL DEFAULT (now()::text),
  updated_at      TEXT NOT NULL DEFAULT (now()::text),

  -- One preference per (user, scope, scope_value) — scope_value can be null for global
  UNIQUE (user_id, scope, scope_value)
);

CREATE INDEX IF NOT EXISTS notification_prefs_user_idx
  ON notification_preferences (user_id, scope, scope_value);

-- 3. Notification outbox (transactional event → notification record)
CREATE TABLE IF NOT EXISTS notification_outbox (
  id              TEXT PRIMARY KEY,                    -- UUID
  event           TEXT NOT NULL,                       -- e.g. 'work_run.completed'
  urgency         TEXT NOT NULL DEFAULT 'normal'
    CHECK (urgency IN ('high', 'normal', 'low')),

  -- Target
  thread_id       TEXT NOT NULL,
  channel_id      TEXT NOT NULL,
  stage_id        TEXT,

  -- Privacy-safe push payload
  title           TEXT NOT NULL,                       -- max 100 chars
  body            TEXT NOT NULL,                       -- max 200 chars
  app_url         TEXT NOT NULL,                       -- deep-link URL
  icon            TEXT DEFAULT '/icon-192.png',

  -- Server-side metadata (not pushed)
  source_event_id TEXT NOT NULL,
  actor           TEXT,

  -- Processing state
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'preference_blocked', 'dispatched', 'failed', 'skipped')),
  created_at      TEXT NOT NULL DEFAULT (now()::text),
  processed_at    TEXT,

  -- Idempotency: one notification per source event
  UNIQUE (source_event_id, event)
);

CREATE INDEX IF NOT EXISTS notification_outbox_status_idx
  ON notification_outbox (status, created_at);

CREATE INDEX IF NOT EXISTS notification_outbox_thread_idx
  ON notification_outbox (thread_id, created_at DESC);

-- 4. Delivery attempts (per-subscription delivery tracking)
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id              TEXT PRIMARY KEY,
  outbox_id       TEXT NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES notification_subscriptions(id) ON DELETE CASCADE,
  attempt         INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'invalid_subscription')),
  error_detail    TEXT,
  created_at      TEXT NOT NULL DEFAULT (now()::text),
  completed_at    TEXT,

  UNIQUE (outbox_id, subscription_id, attempt)
);

CREATE INDEX IF NOT EXISTS notification_deliveries_outbox_idx
  ON notification_deliveries (outbox_id);

CREATE INDEX IF NOT EXISTS notification_deliveries_pending_idx
  ON notification_deliveries (status, created_at)
  WHERE status = 'pending';

-- 5. In-app notification inbox state
CREATE TABLE IF NOT EXISTS notification_inbox (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  outbox_id       TEXT NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
  read            BOOLEAN NOT NULL DEFAULT false,
  dismissed       BOOLEAN NOT NULL DEFAULT false,
  created_at      TEXT NOT NULL DEFAULT (now()::text),
  read_at         TEXT,
  dismissed_at    TEXT,

  UNIQUE (user_id, outbox_id)
);

CREATE INDEX IF NOT EXISTS notification_inbox_user_idx
  ON notification_inbox (user_id, read, dismissed, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_inbox_unread_idx
  ON notification_inbox (user_id, created_at DESC)
  WHERE read = false AND dismissed = false;
