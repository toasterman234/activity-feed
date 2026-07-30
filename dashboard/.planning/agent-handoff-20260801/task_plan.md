# Task Plan: Agent Handoff Batch — 2026-08-01

## Goal
Execute the batch of handoff items from the prior Cursor agent: test+fix tree Done/Reopen, add Kanban to issues channel and Home, add Tree DnD persist, and optionally add Conversation Timeline.

## Current Phase
Phase 0

## Phases

### Phase 0: Audit & scoping (read-only)
- [x] Verify tree Done/Reopen API path works
- [x] Check current Kanban component health
- [x] Check issue channel Kanban toggle
- [x] Check Tree DnD infrastructure
- [x] Identify TududiPlanningTree deficiencies
- **Status:** complete

### Phase 1: Smoke tree Done/Reopen on /projects
- [x] Test Done/Reopen flow on Tududi planning tree
- [x] Fix any issues found (idempotency, error handling, UI feedback)
- **Status:** complete

### Phase 2: Issue-channel Kanban
- [x] Add Kanban view toggle to issue channels
- [x] Wire Kanban columns to issue lifecycle states
- **Status:** complete

### Phase 3: Home Kanban
- [x] Add Kanban view option to Home dashboard (aggregated across channels)
- [x] Design: what columns, what cards
- **Status:** complete

### Phase 4: Tree DnD persist
- [x] Enable headless-tree drag-and-drop reorder
- [x] Persist reorder to Tududi via API
- **Status:** complete

### Phase 5: Optional — Conversation Timeline
- **Status:** deferred (per user: keep deferred with tweakcn/todo10/Tasks)

### Phase 6: Doc — agent handoff notes
- [x] Write handoff documentation for next agent
- **Status:** complete

### Phase 7: Post-promote cleanup
- [x] Delete proto-4/5/10 sandbox dirs
- [x] Delete proto nav component
- [x] Delete proto-only middleware (no gate left)
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
|          |           |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       |         |            |

## Notes
- Branch: `theme-prototype` (dirty)
- Tududi API: `/api/tududi` proxy to Tududi container
- Tududi project: `w3yg7n93tat3t6p` (activity-dashboard-pwa)
- Use `ad:pwa:ui-kit:…` ids for idempotent upserts
- Deferred items out of scope: tweakcn editor, todo10, Tasks example
