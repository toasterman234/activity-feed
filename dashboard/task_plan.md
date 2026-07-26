# Task Plan: GuideBar — Guided Lifecycle Experience

## Goal
Replace the manual lifecycle UI (StateFlow diagram, checkbox workflows, advance buttons) with a single **GuideBar** component that tells the user where they are, what's next, and offers to do it — one bar, two buttons ("Do it for me", "Mark done myself"). Same lifecycle engine underneath; the app narrates and drives.

## Current Phase
Phase 6

## Phases

### Phase 1: `nextStepSummary()` helper + fix agent→state hook
- [x] Add `nextStepSummary(lifecycle, state, enabledWorkflows)` in `lifecycles.ts`: returns step N of M, human sentence for what runs at next state, and legal next states. Pure function.
- [x] Fix weak agent→state hook in `trigger/route.ts`: validate proposed `nextState` against `canTransition()`, apply via `transitionThreadState()`, post visible system message on success and rejection.
- **Status:** complete
- **Affected files:** `src/app/channels/lifecycles.ts`, `src/app/api/channels/trigger/route.ts`

### Phase 2: `GuideBar.tsx` component
- [x] Build `GuideBar.tsx`: reads `thread_meta` + `Lifecycle` to render one sentence ("Coding · Step 2 of 5: In Progress — Next: run tests, then move to Review"), current-state chip, "Do it for me" / "Mark done myself" buttons, error/retry state, terminal state ("Done — promote to project?").
- **Status:** complete
- **Affected files:** new `src/app/channels/GuideBar.tsx`

### Phase 3: `POST /api/channels/advance` endpoint
- [x] New API route `POST /api/channels/advance`: triggers agent run for current state (reusing trigger logic), then on success calls `transitionThreadState()`; returns structured status (ran / gated / failed + reason). Record progress in `thread_workflow_steps`.
- **Status:** complete
- **Affected files:** new `src/app/api/channels/advance/route.ts`

### Phase 4: Lifecycle auto-suggest
- [x] On first thread view with no `thread_meta.lifecycle`, show a one-tap suggestion (channel `default_lifecycle` first, else classify first message). Accept → write meta; decline → compact picker as today.
- **Status:** complete
- **Affected files:** `src/app/channels/[channelId]/[threadId]/page.tsx`

### Phase 5: Rework thread page layout
- [x] Pin GuideBar at top of thread detail page
- [x] Collapse StateFlow, workflow checkboxes, workflow-steps log into a "details" disclosure below the GuideBar
- [x] Keep live-activity trace where it is
- [x] Keep AdvanceStateButtons hidden (replaced by GuideBar actions)
- **Status:** complete
- **Affected files:** `src/app/channels/[channelId]/[threadId]/page.tsx`

### Phase 6: Browser-check on OVH
- [ ] Click through happy path: suggest → accept → do-it-for-me → auto-advance → done
- [ ] Click through edge cases: gated failure + retry, decline suggestion, terminal state
- **Status:** pending
- **Affected files:** none (manual QA)

## Open Decisions (from spec)
- **"Do it for me" streaming**: reuse existing live-activity trace, show spinner in GuideBar (cheapest option)
- **Auto-advance policy**: confirm terminal/proven states; auto-advance for intermediate states
- **Classifier for auto-suggest**: keyword heuristic for v1 (cheap classify of first message)

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Plan files live in `dashboard/` not repo root | Source code is in `dashboard/`; plans reference `src/` paths |
| Order: Phase 1 (helpers + fix) → Phase 2 (component) → Phase 3 (endpoint) → Phase 4 (auto-suggest) → Phase 5 (layout) → Phase 6 (QA) | Dependencies: GuideBar needs `nextStepSummary`, advance endpoint needs trigger fix, layout needs GuideBar component |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       |         |            |

## Notes
- All existing lifecycle engine code (`lifecycles.ts`, `transitionThread.ts`) is left untouched — this is additive
- Spec doc: `~/activity-feed/docs/plans/guidebar-guided-lifecycle.md` (commit 4aae017, not pushed)
- No schema changes expected; possibly one new column only if run-status for "Do it for me" can't be derived from `thread_workflow_steps` + `thread_activity_events`
