# Task Plan: Guided workflow cockpit

## Goal
Make channels and threads workflow-first: every thread has a versioned lifecycle
instance, durable transition history, stage-scoped tasks and artifacts, and a
mobile-first cockpit that makes the current stage, requirements, blockers, and
next action more prominent than the raw conversation.

## Current Phase
Phase 7

## Phases

### Phase 1: Workflow contracts and persistence
- [x] Extend lifecycle definitions with versioned stage guidance, requirements, outputs, and approvals.
- [x] Add additive workflow event and stage-scoping schema.
- [x] Make thread creation transactional so lifecycle metadata always exists.
- [x] Backfill existing threads and channel lifecycle defaults.
- **Status:** complete

### Phase 2: Runtime enforcement and history
- [x] Record authoritative workflow events for creation, transitions, gates, and completion.
- [x] Return stage-scoped tasks, artifacts, events, and run summaries from thread extras.
- [x] Keep current state as a read projection while preserving append-only history.
- **Status:** complete

### Phase 3: Workflow cockpit UI
- [x] Replace the chat-dominant thread header with stage navigation and a current-stage action card.
- [x] Add clear requirements, outputs, blockers, tasks, runs, artifacts, and history views.
- [x] Keep conversation available as a secondary tab and collapse raw activity details by default.
- **Status:** complete

### Phase 4: Verification, data migration, and OVH deployment
- [x] Run targeted tests, typecheck, shape-budget check, and production build.
- [x] Apply additive DDL and backfill on OVH.
- [x] Deploy the verified dashboard to OVH.
- [x] Verify the linked Research/NAC thread and production health.
- **Status:** complete

### Phase 5: Inline Frame interview
- [x] Add durable stage interactions and approved frame storage.
- [x] Add a Frame API that asks one material follow-up at a time or proposes a structured frame.
- [x] Render the Frame interview directly inside the cockpit.
- [x] Require explicit approval before moving to Gather.
- **Status:** complete

### Phase 6: Personal Context Scan
- [x] Add scan and candidate persistence.
- [x] Search Graph Continuity, previous threads, Agent Brain, Life OS, and the Obsidian vault through available infrastructure.
- [x] Show cited candidates inline with include/ignore controls.
- [x] Persist only approved candidates into the thread context package.
- **Status:** complete

### Phase 7: Production verification and deployment
- [x] Run targeted checks and the OVH production build.
- [x] Apply the additive migration.
- [x] Deploy and verify the NAC UI, routes, persistence, and transition gates without mutating the user's thread.
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Preserve `messages` root IDs as work-item IDs in this increment | Avoids a high-risk destructive identity migration while enforcing the missing lifecycle invariant. |
| Add a versioned workflow instance to `thread_meta` | Existing readers remain compatible and historical threads pin their lifecycle contract. |
| Add an append-only `thread_workflow_events` table | Transition history should be authoritative instead of reconstructed from chat messages. |
| Scope existing plans and artifacts by stage with additive columns | Reuses working tables without a disruptive rewrite. |
| Keep lifecycle templates in version-controlled code initially | Matches the current deployment model and allows runtime semantics to stabilize before a visual template editor. |
| Use an operations-console visual direction | Dense, calm, legible, and mobile-first; the workflow state is the dominant visual object. |
| Ask one framing question at a time | Keeps the default input minimal while allowing the agent to resolve only material ambiguity. |
| Keep stage interactions outside chat presentation | The cockpit becomes the primary workspace while interactions can still be mirrored into the audit trail. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Browser control bootstrap failed with `Cannot redefine property: process` during assessment | 1 | Used production HTML, source inspection, database inspection, and existing UI captures instead. |
| Existing root planning files belong to an unrelated Fleet task | 1 | Created isolated planning files under `.planning/workflow-cockpit/`. |
| Shell expanded the bracketed dynamic-route path while inspecting source | 1 | Re-ran targeted reads with the path quoted; no implementation state was affected. |
| Full TypeScript check reports pre-existing errors in Activity, Models, service worker types, dynamic-route state typing, and the embedded Electric client | 1 | Kept the baseline errors out of scope and use the production Next build plus targeted error filtering for this change. |
| Local Next production build became idle during webpack compilation under local Node 24 | 1 | Terminated the wedged process and will verify with the production deployment host's Node 20 build, which is the canonical runtime. |
| First OVH migration attempt hit ambiguous `created_at` in an `UPDATE ... FROM` backfill | 1 | Transaction rolled back; qualified the target/source columns and reran the idempotent migration. |
| First production-to-Mac context search was interrupted while recursively scanning the SSD vault | 1 | Replaced `Path.rglob` with bounded `os.walk`, pruned hidden directories, and ignored transient filesystem interruptions per file/directory. |
| macOS still intermittently interrupts external-volume reads from a remote SSH session | 2 | The scan returns partial DB/local-source results, exposes retry/skip, and never admits unreviewed context; direct vault indexing remains a follow-up hardening item. |

## Constraints
- Preserve the Electric live-shape budget; thread detail additions must use the existing polled extras endpoint.
- Do not regress Pi process handling; all Pi invocations keep stdin closed.
- Make database changes additive and rollback-friendly.
- Preserve all unrelated dirty-worktree changes.
- Deploy only after the complete build passes.
