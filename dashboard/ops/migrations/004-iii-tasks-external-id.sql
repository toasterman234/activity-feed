-- iii harness task store: idempotency key on thread_plans
-- Apply with: ACTIVITY_DB_URL=... npm run init:iii-tasks

ALTER TABLE thread_plans
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS thread_plans_thread_external_uidx
  ON thread_plans (thread_id, external_id)
  WHERE external_id IS NOT NULL;
