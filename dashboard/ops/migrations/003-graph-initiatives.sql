-- Graph initiatives + promote gate (ActiveGraph-shaped, Postgres)
-- Apply with: ACTIVITY_DB_URL=... node scripts/init-graph-initiatives.mjs

CREATE TABLE IF NOT EXISTS graph_initiatives (
  id              TEXT PRIMARY KEY,
  evidence_map_id TEXT,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'active', 'blocked', 'shipped', 'deferred')),
  channel_id      TEXT,
  thread_id       TEXT,
  plan_path       TEXT,
  evidence_refs   TEXT NOT NULL DEFAULT '[]',
  blocked_by      TEXT,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  shipped_at      TEXT,
  shipped_by      TEXT,
  ship_evidence   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS graph_initiatives_evidence_map_uidx
  ON graph_initiatives (evidence_map_id)
  WHERE evidence_map_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS graph_initiatives_status_idx
  ON graph_initiatives (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS graph_initiatives_thread_idx
  ON graph_initiatives (thread_id, updated_at DESC)
  WHERE thread_id IS NOT NULL;
