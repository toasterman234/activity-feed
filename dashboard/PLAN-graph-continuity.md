# PLAN — Graph Continuity (B + C + D)

**Status:** shipped on OVH and rolled out globally on 2026-07-27  
**Repo:** `/Users/bencharney/activity-feed/dashboard`  
**Origin thread:** Channels → `#meta` → “Graph continuity B+C+D” (planning lifecycle; first proving ground)  
**Out of scope:** ax-brain-crew / Ax LLM; full Python Active Graph runtime (optional later)

## 0a. Current status

- **Phase 1:** live — ontology tables, writers, fold, thread timeline, top continuity row
- **Phase 2:** live — human `Decide`, decision inbox, active-decision fold, contradiction refusal/supersede path
- **Phase 3:** live for v1 — capability allowlist, proposal review/apply, duplicate damping, applied capability state
- **Rollout:** originally `#meta` only; now enabled for all channels on OVH


## 0. Goal

Give day-to-day **@pi / @claude** channel agents a shared, compounding world so they:

1. **Coordinate** — know what was done and where we are (not one-shot amnesia)
2. **Compound** — repeated issues become immutable decisions that constrain later turns
3. **Self-improve** — propose grounded improvements with evidence; humans gate apply

Inspired by Active Graph siblings (not a port of the Python runtime):

| Direction | Source | What we take |
|-----------|--------|--------------|
| **C** | [activegraph-packs](https://github.com/yoheinakajima/activegraph-packs) Core + memory_gateway | `source → observation → memory_candidate → evaluation → memory_item` — never write memory directly |
| **B** | [activegraph-lab](https://github.com/yoheinakajima/activegraph-lab) | `decision` inbox; agents propose/annotate; only human approves |
| **D** | [activegraph-selfgraph](https://github.com/yoheinakajima/activegraph-selfgraph) | Capability-grounded `PatchProposal` + structural allowlist + review → apply |

---

## 1. Architecture context

Channels today:

- Writes → Postgres via `POST /api/channels/write` (`src/app/api/_db.ts`). Never write through Electric.
- Live shapes: channels / members / messages only (`SHAPE_BUDGET` = 4). Secondary data **polls** via `useThreadExtras` (`src/app/channels/shapes.ts`).
- Mentions → `POST /api/channels/trigger` → `pi` one-shot (`--no-session`) via `execFileNoStdin` ([ADR-006](docs/decisions/ADR-006-pi-channel-stdin.md)).
- Reply contract now extends the base chat schema with checkpoint / observations / memory_candidates / decision / proposal.
- Lifecycles: `src/app/channels/lifecycles.ts` (`coding` | `research` | `planning` | `issue`).
- Migrations now live under `dashboard/ops/migrations/`; apply them to Postgres and keep `schema.ts` aligned.

**Problem this plan addressed:** every mention was stateless; only the last ~8 messages were folded; there was no admitted memory, decision gate, or grounded proposal lane.

---

## 2. Unified model

```
mention / human message
  → source
  → observation(s)
       → memory_candidate → evaluation → memory_item (if accepted)
       → decision (pending) → human inbox → active | rejected
       → patch_proposal (capability-grounded) → inbox → apply | reject
  → prompt fold on next mention: checkpoint + active decisions + accepted memory
```

### Hard rules

1. **Never write memory directly** — only `memory_candidate`; admission via evaluation.
2. **Decisions are human-gated** — Pi/Claude create `pending`; only dashboard operator resolves.
3. **Proposals are structurally constrained** — `changes[]` only against allowlisted capability ids in `capabilities.ts`.
4. **Fold only admitted state** — active decisions + accepted memory_items + latest checkpoint.
5. **Supersede, don’t edit** — new decision + `supersedes` relation.

### Feature flag

`CHANNEL_GRAPH=1` (env). Empty `CHANNEL_GRAPH_CHANNELS` = all channels; a populated allowlist scopes rollout.

---

## 3. Data model (Phase 1+ tables)

Apply DDL to `ACTIVITY_DB_URL` (default `postgres://activity:activity@localhost:5433/activity_log`) **and** declare in `src/app/schema.ts`. Prefer **poll** for new tables (do not burn shape budget).

Phase 2/3 rollout added review metadata plus `graph_capability_state` for deterministic proposal apply. The SQL below is the original core schema; see the follow-up migration for the review/apply additions.

```sql
-- Append-only audit
CREATE TABLE IF NOT EXISTS graph_events (
  id          TEXT PRIMARY KEY,
  channel_id  TEXT NOT NULL,
  thread_id   TEXT,
  kind        TEXT NOT NULL,
  actor       TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  caused_by   TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_sources (
  id          TEXT PRIMARY KEY,
  channel_id  TEXT NOT NULL,
  thread_id   TEXT,
  kind        TEXT NOT NULL,          -- chat_message | agent_reply | …
  ref_id      TEXT,                   -- messages.id when applicable
  content     TEXT NOT NULL,
  author      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_observations (
  id          TEXT PRIMARY KEY,
  channel_id  TEXT NOT NULL,
  thread_id   TEXT,
  source_id   TEXT,
  category    TEXT NOT NULL,          -- fact | decision | preference | action_item | issue | checkpoint | …
  text        TEXT NOT NULL,
  confidence  DOUBLE PRECISION,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_memory_candidates (
  id          TEXT PRIMARY KEY,
  channel_id  TEXT NOT NULL,
  thread_id   TEXT,
  observation_id TEXT,
  text        TEXT NOT NULL,
  category    TEXT NOT NULL,
  confidence  DOUBLE PRECISION,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_memory_items (
  id          TEXT PRIMARY KEY,
  channel_id  TEXT NOT NULL,
  thread_id   TEXT,                   -- null = channel-scoped
  candidate_id TEXT,
  text        TEXT NOT NULL,
  category    TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_decisions (
  id          TEXT PRIMARY KEY,
  channel_id  TEXT NOT NULL,
  thread_id   TEXT,
  statement   TEXT NOT NULL,
  rationale   TEXT,
  evidence    TEXT NOT NULL DEFAULT '[]',       -- JSON refs
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | active | rejected | superseded
  supersedes  TEXT,
  resolved_by TEXT,
  resolution_rationale TEXT,
  created_at  TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS graph_proposals (
  id          TEXT PRIMARY KEY,
  channel_id  TEXT NOT NULL,
  thread_id   TEXT,
  hypothesis  TEXT NOT NULL,
  capability_ids TEXT NOT NULL DEFAULT '[]',    -- JSON
  changes     TEXT NOT NULL DEFAULT '[]',       -- JSON allowlisted ops
  evidence    TEXT NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'draft',    -- draft | pending | accepted | rejected | applied
  created_at  TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS graph_relations (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,          -- grounds | produces | proposes | evaluates | grounded_in | supersedes
  source_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
```

v1 may merge candidates/items if needed, but **keep the admission process**.

---

## 4. Reply schema extensions

Extend `src/app/api/channels/trigger/reply-schema.json`:

```json
{
  "checkpoint": { "where_we_are": "string", "open_items": ["string"] },
  "observations": [{ "text": "string", "category": "string", "confidence": 0.0 }],
  "memory_candidates": [{ "text": "string", "category": "string", "confidence": 0.0 }],
  "decision": { "statement": "string", "rationale": "string", "evidence_refs": ["string"] },
  "proposal": {
    "hypothesis": "string",
    "capability_ids": ["string"],
    "changes": [{}],
    "evidence_refs": ["string"]
  }
}
```

`trigger/route.ts` persists these into graph tables when `CHANNEL_GRAPH=1`. Human messages create `graph_sources` (+ optional light observation) on write/trigger entry.

---

## 5. Capability allowlist (Direction D)

New file: `src/app/channels/capabilities.ts`

v1 allowed ids:

| Id | Apply means |
|----|-------------|
| `prompt.fold_rules` | Patch fold limits / include lists (config row or code constant behind flag) |
| `lifecycle.workflow_toggle` | Enable/disable named workflow on a lifecycle state for a channel |
| `reply.schema_field` | Record accepted schema addition (manual follow-up OK in v1) |
| `memory.admission_threshold` | Change auto-accept confidence cutoff |
| `channel.default_lifecycle` | Propose channel default lifecycle change |

Reject unknown capability ids at insert. Accept → deterministic TS patcher (no LLM apply).

---

## 6. UX

1. **Thread Timeline** — shipped. Messages merge with graph events / decisions / proposals / observations.
2. **Decision Inbox** — shipped at `/channels/inbox`; pending decisions, proposals, and memory candidates can be resolved there.
3. **Memory panel** — shipped in v1 as inbox review plus accepted-memory view in the continuity row.
4. **Proposal review** — shipped with capability ids, changes JSON, evidence refs, and deterministic apply.

---

## 7. Prompt fold

When `CHANNEL_GRAPH=1`, every mention prompt includes a block:

```
## Admitted context (do not ignore)
### Checkpoint
…
### Active decisions
…
### Accepted memory
…
### Open proposals (titles only)
…
```

Contradicting an active decision → agent must open a supersede decision/proposal, not silently ignore.

---

## 8. Build phases

### Phase 1 — Core ontology + fold (C) — unblocks coordination
- [x] DDL + `schema.ts`
- [x] Writers from `trigger/route.ts` (+ source on human message path)
- [x] Auto-eval policy (high-confidence fact/preference auto-accept; others pending)
- [x] Fold into pi prompt
- [x] Thread Timeline (read-only)
- [x] Flagged rollout proved on `#meta`, then widened globally

**Proved:** second @mention cited checkpoint/memory without being asked.

### Phase 2 — Decision inbox (B) — compounding
- [x] `graph_decisions` from reply `decision` + human `Decide`
- [x] Inbox Approve/Reject
- [x] Fold active decisions; contradict → refuse or supersede path

**Proved:** agent asked to violate a decision refused; explicit supersede flow also passed.

### Phase 3 — Proposal lane (D) — self-improvement
- [x] `capabilities.ts` + validation
- [x] `graph_proposals` + review UI
- [x] Accept → deterministic apply + event
- [x] Reject → rationale; damp duplicates

**Proved:** `@pi` proposed a fold-rule change, it was applied, and the next run used the new fold behavior.

---

## 9. Rollout history

- First proving ground: **`meta`**
- First proof thread: **Graph continuity B+C+D**
- Current OVH scope: **all channels** (`CHANNEL_GRAPH_CHANNELS=` / empty allowlist)
- Recommendation: keep using `meta` as the safest place for future graph-behavior experiments before widening any new capability changes

---

## 10. Documentation surfaces

| Surface | Role |
|---------|------|
| `#meta` thread + `DESIGN.md` artifact | Working design, challenge, accept |
| This file `PLAN-graph-continuity.md` | Implementable build spec |
| `docs/decisions/ADR-00N-…` | Settled infra choices after Phase 1+ |

---

## 11. Non-goals

- Python Active Graph / fork-diff runtime
- Replacing lifecycle FSM with a graph editor
- Full Core relation vocabulary on day one
- Auto-extracting capabilities from agent codebases
- ax-brain-crew integration

---

## 12. References

- Working plan (Cursor): Active Graph Fit Analysis  
- https://docs.activegraph.ai/  
- https://github.com/yoheinakajima/activegraph-packs  
- https://github.com/yoheinakajima/activegraph-lab  
- https://github.com/yoheinakajima/activegraph-selfgraph  
- Prior patterns: `PLAN-issues-channel.md`, `PLAN-lifecycles.md`, ADR-003 / ADR-006  
