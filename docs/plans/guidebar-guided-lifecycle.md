# Plan: GuideBar — guided lifecycle experience for channels dashboard
- Date: 2026-07-26 · Session/source: Claude Code conversation (workflows/lifecycles/state review of dashboard app on OVH)

## Goal / Why
Lifecycles/workflows/state in the channels app work but feel like wasted UI: everything is manual (pick lifecycle, toggle checkboxes, click every transition), prompt workflows are invisible, and the state diagram is passive. Ben wants a **semi-guided experience**: the thread should tell him where he is, what's next, and offer to do it — one bar, two buttons. Same engine underneath; the app narrates and drives, the user approves.

## Approach
Keep the existing lifecycle engine (`src/app/channels/lifecycles.ts`, `transitionThread.ts`, `thread_meta`) untouched as the source of truth. Add a presentation + orchestration layer on top:

- **GuideBar component** replaces the top-of-thread clutter. Reads `thread_meta` (lifecycle, state, enabled_workflows) + `LIFECYCLES` to render one sentence — "Coding · Step 2 of 5: In Progress — Next: run tests, then move to Review" — plus two buttons: **"Do it for me"** and **"Mark done myself"**. Failed/gated transitions render in the same bar (red, reason, Retry button).
- **"Do it for me" endpoint** (`/api/channels/advance` or similar) chains what is today 3 manual actions: trigger the agent with the current state's enabled prompt workflows → on success, run `transitionThreadState()` to the next state (command workflows + gates fire as they do now) → post the plain system message ("✓ Tests passed → moved to Review").
- **Strengthen the agent→state hook** in `/api/channels/trigger/route.ts`: the agent's `nextState` proposal currently fails silently. Validate it against legal transitions; on success advance, on failure surface the reason in the thread (system message) and in the GuideBar.
- **Lifecycle auto-suggest**: when a thread has no lifecycle, instead of a dropdown, post an in-thread agent question ("Looks like a coding task — run it as a Coding flow?") seeded from the channel's existing `default_lifecycle`, falling back to a cheap classify of the first message. One-tap accept sets `thread_meta`.
- **Demote, don't delete, the old UI**: StateFlow diagram, workflow checkboxes, and workflow-steps log move behind a "details" disclosure below the GuideBar. No schema changes expected; possibly one new column only if run-status for "Do it for me" can't be derived from `thread_workflow_steps` + `thread_activity_events`.

Key files: `src/app/channels/[channelId]/[threadId]/page.tsx` (layout), `StateFlow.tsx` / `AdvanceStateButtons.tsx` (demoted), `transitionThread.ts` (reused), `api/channels/trigger/route.ts` (hook), new `GuideBar.tsx` + new advance route.

## Tasks
- [ ] 1. Add a `nextStepSummary(lifecycle, state, enabledWorkflows)` helper in `lifecycles.ts` (or beside it) that returns: step N of M, human sentence for what runs at the next state, and legal next states. Pure function, unit-testable.
- [ ] 2. Build `GuideBar.tsx`: renders the sentence, current-state chip, "Do it for me" / "Mark done myself" buttons, error/retry state. Terminal state renders "Done — promote to project?".
- [ ] 3. New API route `POST /api/channels/advance`: triggers the agent run for the current state (reusing trigger logic), then on success calls `transitionThreadState()`; returns structured status (ran / gated / failed + reason). Record progress in `thread_workflow_steps` as today.
- [ ] 4. Fix the weak agent→state hook in `trigger/route.ts`: validate proposed `nextState`, apply via `transitionThreadState()`, post a visible system message on both success and rejection.
- [ ] 5. Lifecycle auto-suggest: on first thread view with no `thread_meta.lifecycle`, show a one-tap suggestion (channel `default_lifecycle` first, else classify first message). Accept → write meta; decline → compact picker as today.
- [ ] 6. Rework thread page layout: GuideBar pinned at top; StateFlow, workflow checkboxes, steps log collapse into a "details" section. Keep live-activity trace where it is.
- [ ] 7. Browser-check on OVH (per Ben's rule): click through happy path (suggest → accept → do-it-for-me → auto-advance → done) and edge cases (gated failure + retry, decline suggestion, terminal state).

## Open decisions
- **Does "Do it for me" stream progress in the GuideBar** or just rely on the existing live-activity trace? (Cheapest: reuse trace, bar shows spinner.)
- **Auto-advance policy**: always advance on agent-reported success, or require the user's tap for terminal/proven states only? (Sketch says confirm terminal states — recommend that.)
- **Classifier for auto-suggest** when channel has no `default_lifecycle`: small pi call vs keyword heuristic. Heuristic is fine for v1.
