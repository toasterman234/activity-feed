# Progress Log: Graph Continuity

## Status
Completed and rolled out globally on OVH on 2026-07-27.

## Major milestones

### 2026-07-26 — Phase 1 foundation
- Surveyed the channel stack and chose a poll-based graph UI path to preserve shape budget
- Added the Phase 1 graph tables and schema declarations
- Extended the reply schema with checkpoint / observations / memory_candidates / decision / proposal
- Added graph writers, auto-admit policy, and prompt fold
- Added thread timeline graph polling and thread UI rendering

### 2026-07-27 — Phase 2 / 3 completion
- Added Graph Inbox API + UI for decisions, proposals, and memory candidates
- Added human `Decide:` intake and thread-level Decide action
- Added supersede-aware decision flow and approval behavior
- Added capability allowlist / proposal validation / duplicate damping
- Added deterministic proposal apply with persisted capability state
- Added migration `002-graph-review-and-capabilities.sql`

### 2026-07-27 — Live proofs and rollout
- Proved checkpoint/memory recall on `#meta`
- Proved decision refusal and explicit supersede flow on `#meta`
- Proved proposal apply changed next-run fold behavior on `#meta`
- Expanded rollout from `#meta` to all channels
- Smoke-tested continuity outside `#meta`

## Current production state
- OVH production
- Graph continuity enabled for all channels
- Inbox reviews decisions, proposals, and memory candidates
- Proposal capability `reply.schema_field` remains a tracked manual follow-up in v1
