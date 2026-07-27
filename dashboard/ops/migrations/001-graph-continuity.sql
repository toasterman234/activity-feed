-- Graph Continuity (Phase 1) — 8 tables for shared agent memory
-- Run against ACTIVITY_DB_URL (default postgres://activity:activity@localhost:5433/activity_log)
-- Idempotent: uses IF NOT EXISTS

-- Append-only audit trail of all graph operations
CREATE TABLE IF NOT EXISTS graph_events (
  id         TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  thread_id  TEXT,
  kind       TEXT NOT NULL,
  actor      TEXT NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}',
  caused_by  TEXT,
  created_at TEXT NOT NULL
);

-- Inbound mentions / human messages — the raw material for observations
CREATE TABLE IF NOT EXISTS graph_sources (
  id         TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  thread_id  TEXT,
  kind       TEXT NOT NULL,          -- chat_message | agent_reply
  ref_id     TEXT,                   -- messages.id when applicable
  content    TEXT NOT NULL,
  author     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Extracted facts, decisions, preferences etc. from a source
CREATE TABLE IF NOT EXISTS graph_observations (
  id         TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  thread_id  TEXT,
  source_id  TEXT,
  category   TEXT NOT NULL,          -- fact | decision | preference | action_item | issue | checkpoint
  text       TEXT NOT NULL,
  confidence DOUBLE PRECISION,
  created_at TEXT NOT NULL
);

-- Proposed memory — not yet admitted
CREATE TABLE IF NOT EXISTS graph_memory_candidates (
  id             TEXT PRIMARY KEY,
  channel_id     TEXT NOT NULL,
  thread_id      TEXT,
  observation_id TEXT,
  text           TEXT NOT NULL,
  category       TEXT NOT NULL,
  confidence     DOUBLE PRECISION,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  created_at     TEXT NOT NULL
);

-- Admitted memory — what agents fold into future prompts
CREATE TABLE IF NOT EXISTS graph_memory_items (
  id           TEXT PRIMARY KEY,
  channel_id   TEXT NOT NULL,
  thread_id    TEXT,                 -- null = channel-scoped
  candidate_id TEXT,
  text         TEXT NOT NULL,
  category     TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

-- Human-gated decisions (pending → active/rejected/superseded)
CREATE TABLE IF NOT EXISTS graph_decisions (
  id                    TEXT PRIMARY KEY,
  channel_id            TEXT NOT NULL,
  thread_id             TEXT,
  statement             TEXT NOT NULL,
  rationale             TEXT,
  evidence              TEXT NOT NULL DEFAULT '[]',
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending | active | rejected | superseded
  supersedes            TEXT,
  resolved_by           TEXT,
  resolution_rationale  TEXT,
  created_at            TEXT NOT NULL,
  resolved_at           TEXT
);

-- Agent-authored improvement proposals (capability-grounded)
CREATE TABLE IF NOT EXISTS graph_proposals (
  id             TEXT PRIMARY KEY,
  channel_id     TEXT NOT NULL,
  thread_id      TEXT,
  hypothesis     TEXT NOT NULL,
  capability_ids TEXT NOT NULL DEFAULT '[]',
  changes        TEXT NOT NULL DEFAULT '[]',
  evidence       TEXT NOT NULL DEFAULT '[]',
  status         TEXT NOT NULL DEFAULT 'draft',  -- draft | pending | accepted | rejected | applied
  created_at     TEXT NOT NULL,
  resolved_at    TEXT
);

-- Links between graph entities (grounds, produces, evaluates, supersedes, etc.)
CREATE TABLE IF NOT EXISTS graph_relations (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,          -- grounds | produces | proposes | evaluates | grounded_in | supersedes
  source_id  TEXT NOT NULL,
  target_id  TEXT NOT NULL,
  created_at TEXT NOT NULL
);
