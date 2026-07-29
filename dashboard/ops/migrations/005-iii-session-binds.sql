-- iii session → dashboard thread binds
-- Apply with: ACTIVITY_DB_URL=... npm run init:iii-binds

CREATE TABLE IF NOT EXISTS iii_session_binds (
  session_id   TEXT PRIMARY KEY,
  thread_id    TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  repo_id      TEXT,
  title        TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS iii_session_binds_thread_idx
  ON iii_session_binds (thread_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS iii_session_binds_repo_idx
  ON iii_session_binds (repo_id, updated_at DESC)
  WHERE repo_id IS NOT NULL;
