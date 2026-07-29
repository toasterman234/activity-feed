-- Rollback for notification subsystem (006-notifications.sql)
-- Apply with: ACTIVITY_DB_URL=... node scripts/rollback-notifications.mjs

DROP TABLE IF EXISTS notification_inbox CASCADE;
DROP TABLE IF EXISTS notification_deliveries CASCADE;
DROP TABLE IF EXISTS notification_outbox CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;
DROP TABLE IF EXISTS notification_subscriptions CASCADE;
