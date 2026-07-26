# Findings: GuideBar — Guided Lifecycle Experience

Research, discoveries, and information gathered during this task.

## 2026-07-26 — Initial codebase survey

### Discovery: Project structure
- Dashboard is a Next.js app under `~/activity-feed/dashboard/`
- Channels code: `dashboard/src/app/channels/` — contains client components
- API routes: `dashboard/src/app/api/channels/` — contains server routes
- Plan files and docs are in `dashboard/` (e.g. `PLAN-lifecycles.md`, `PLAN-project-promotion.md`)

### Discovery: Key files and their roles
| File | Role |
|------|------|
| `lifecycles.ts` | Defines `Lifecycle`, `LifecycleState`, `Workflow`, `LIFECYCLES` map, `canTransition()`, `stateKind()`, `defaultEnabledWorkflows()` |
| `transitionThread.ts` | Server-side `transitionThreadState()` — runs command workflows, handles gating, writes system messages, advances state in DB |
| `trigger/route.ts` | `POST /api/channels/trigger` — spawns `pi` agent with prompt workflows, parses structured reply, handles `nextState` proposal |
| `StateFlow.tsx` | Client component — vertical state diagram with dots, colors, "current" chip |
| `AdvanceStateButtons.tsx` | Client component — buttons for each legal next state |
| `page.tsx` (thread detail) | Huge client component (~600 lines) — all UI panels including lifecycle, state flow, advance, promote, activity trace |

### Discovery: Existing `trigger/route.ts` nextState handling
- Lines ~540-550: when `parsed.nextState` exists, it calls `transitionThreadState()` with `announce: false`
- On `illegal transition` error, it writes an error workflow step
- Problem: the error step is invisible — no system message posted to the thread, no user-facing feedback
- Fix needed: post a visible system message on both success and rejection

### Discovery: Current thread page layout
When lifecycle is picked:
1. Lifecycle picker + workflow checklist (details/summary)
2. StateFlow diagram
3. AdvanceStateButtons
4. Promote panel
5. Plan items
6. Live activity trace
7. Workflow steps
8. Artifacts
9. Thread messages + replies

When no lifecycle: compact "not set" bar with dropdown

### Discovery: Lifecycle data model
- `thread_meta` table: `lifecycle`, `state`, `enabled_workflows`, `archived_at`, `channel_id`, `repo_id`, `promoted_to`, `research_mode`, `priority`, `assignee`
- `thread_workflow_steps` table: `id`, `thread_id`, `step_label`, `status`, `detail`, `created_at`
- `thread_activity_events` table: `id`, `thread_id`, `run_id`, `seq`, `kind`, `label`, `detail`, `status`, `created_at`, `updated_at`

## Key Takeaways
- The lifecycle engine is solid — `transitionThreadState()` handles command workflows, gating, rollback to `failed` state. No changes needed there.
- The agent trigger path already has the structured-reply parsing for `nextState` — just needs visible feedback.
- `StateFlow` and `AdvanceStateButtons` are independent components — easy to demote behind a disclosure without breaking anything.
- The GuideBar can derive its sentence from existing data: `Lifecycle` + `thread_meta.state` + `enabled_workflows`.
