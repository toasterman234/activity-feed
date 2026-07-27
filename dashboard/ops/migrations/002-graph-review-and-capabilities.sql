-- Graph Continuity Phase 2/3 follow-up
-- Adds richer review metadata plus deterministic capability state storage.

ALTER TABLE graph_memory_candidates
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS resolution_rationale TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TEXT;

ALTER TABLE graph_proposals
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS resolution_rationale TEXT;

CREATE TABLE IF NOT EXISTS graph_capability_state (
  id                 TEXT PRIMARY KEY,
  capability_id      TEXT NOT NULL,
  scope_type         TEXT NOT NULL,          -- global | channel
  scope_id           TEXT,
  value              TEXT NOT NULL DEFAULT '{}',
  source_proposal_id TEXT,
  updated_by         TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
