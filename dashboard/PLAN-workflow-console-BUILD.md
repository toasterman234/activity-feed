# BUILD SPEC — Workflow console Phase 1 (for pi)

**Status:** ready to implement  
**Audience:** pi agent — follow phases in order; each phase is independently verifiable  
**Workdir:** `/Users/bencharney/activity-feed/dashboard`  
**Product host:** OVH (`https://ovh-vps.taila1553c.ts.net:8446`) — deploy after the final phase (or after each phase if Ben asks)

Design rationale (human): chat analysis 2026-07-29 — threads feel like chat with workflow chrome; ADR-007 already decided cockpit-first. This BUILD closes that gap.

Related ADRs (read before coding if confused):
- `docs/decisions/ADR-007-workflow-first-threads.md` — cockpit primary, conversation secondary
- `docs/decisions/ADR-003-shape-connection-budget.md` — poll extras, never add live shapes
- `docs/decisions/ADR-010-durable-work-runs.md` / `ADR-011-durable-work-runs.md` — WorkRunsPanel source of truth
- `docs/decisions/ADR-021-workflow-stage-workspaces.md` — stage workspaces stay; this phase does not rewrite them

Depends on already-shipped:
- `src/app/channels/lifecycles.ts` (`nextStepSummary`, `mainPathOrder`, stage modules/gates)
- `src/app/channels/WorkflowCockpit.tsx` (exists, **not mounted**)
- `src/app/channels/GuideBar.tsx` + `AdvanceStateButtons.tsx` (duplicate advance paths)
- `src/app/channels/WorkRunsPanel.tsx` (cancel/retry; buried in Work tab only)
- `src/app/api/channels/advance/route.ts` (agent-assisted advance)
- `src/app/api/channels/transition` / `transitionThread.ts` (manual transition + exit gates)
- `src/app/api/channels/thread-extras/route.ts` + `useThreadExtras` (polled secondary data)

---

## ⚠️ CRITICAL GOTCHAS (read first)

1. **Poll, don't stream.** Extend `useThreadExtras` / `thread-extras` only. Do **not** add a live Electric shape for `thread_workflow_events`. ADR-003 / ADR-007 explicitly forbid it.
2. **No engine recreate for this BUILD** unless you invent new PG tables. This BUILD only **reads** existing `thread_workflow_events` and existing `thread_meta` columns (`template_version`, `stage_started_at`). If those columns are missing on OVH, stop and ask Ben — do not invent DDL mid-flight without confirmation.
3. **DB access:** use `pool` from `src/app/api/_db.ts`. Do not assume local `psql`.
4. **Mobile-first.** Stage Action Bar + cockpit must work on narrow phone width. No desktop-only hover dependencies for primary actions.
5. **Do not rewrite `trigger/route.ts`.** Out of scope. Keep `@agent` chat triggers working.
6. **Do not unify advance into one backend endpoint yet.** Keep `/api/channels/advance` and `/api/channels/transition` (or whatever transition route AdvanceStateButtons already calls). One **UI** button chooses which endpoint.
7. **Thread page is already ~1050 lines.** Prefer new components over dumping more JSX into `[threadId]/page.tsx`.
8. **Commit after each PHASE** with a clear message. Do not batch all phases into one mega-commit unless Ben says so.
9. **Deploy:** only when Ben asks, or after PHASE 5 verify. Use `scripts/deploy-ovh.sh`. Source must be clean unless `OVH_ALLOW_DIRTY=1`. After deploy, hard-refresh the phone PWA (SW cache gotcha — see `AGENTS.md`).
10. **Do not restyle the whole app.** Keep existing zinc/light patterns. Cockpit already has its look — mount it; don't redesign it.

---

## Settled decisions (baked into this spec)

| Decision | Choice |
|---|---|
| Default thread tab | `"work"` (not `"conversation"`) |
| Primary thread chrome | `WorkflowCockpit` + new `StageActionBar` above tabs |
| Conversation | Remains a tab; chat `@agent` still works |
| GuideBar | Removed from thread page after StageActionBar lands (file may remain; unused OK) |
| AdvanceStateButtons on Overview | Remove from Overview once StageActionBar owns alternate transitions |
| DoNowBanner | Keep **only** for `need === "triage"` (issue missing owner/repo). Other needs fold into StageActionBar copy |
| Promote CTA | Exactly **one** visible promote entry point on the thread (StageActionBar terminal path OR PromoteStatusPanel — pick StageActionBar for terminal; keep PromoteStatusPanel for in-progress promotion status only) |
| Live runs | `WorkRunsPanel` above tabs when any run is active/failed/interrupted; still also inside Work tab |
| Branding | App title / PWA title → `Activity` (not Finance Dashboard) |
| Install prompt | Delay 8s before show; keep dismiss-in-localStorage behavior |
| Scope lifecycles | Must work for all lifecycles that use `LIFECYCLES`; prioritize smoke on `coding` + `planning` |

---

## Target thread layout (after PHASE 4)

```
sticky header (back / title / move / archive)
────────────────────────────────────────────
WorkflowCockpit          ← stage path + readiness + pulse
StageActionBar           ← ONE primary CTA + secondary transitions
WorkRunsPanel (compact)  ← ONLY if active/failed/interrupted runs
DoNowBanner              ← ONLY issue triage attention
stage workspaces…        ← existing StageReview / Coding / Modules / Handoff (unchanged logic)
IssueHeader / triage     ← existing
ThreadTabs               ← default active = work
  work | overview | artifacts | conversation | history
composer stays inside conversation tab (existing)
```

---

## PHASE 0 — Extras plumbing for cockpit (no UI yet)

### Goal
`useThreadExtras` returns everything `WorkflowCockpit` and History need. Fix the missing `WorkflowEventRow` type (imported today but **not defined** in `shapes.ts`).

### 0a. Add `WorkflowEventRow` to `src/app/channels/shapes.ts`

```ts
export interface WorkflowEventRow {
  id: string;
  thread_id: string;
  channel_id: string;
  template_id: string;
  template_version: number;
  event_type: string;
  from_state: string | null;
  to_state: string | null;
  actor: string;
  payload: string;
  created_at: string;
}
```

Align field names with the actual `thread_workflow_events` columns used by `src/lib/workflowEvents.ts`. If the DB uses different names, match DB and adapt cockpit filters (cockpit currently reads `event.event_type` and `event.from_state`).

### 0b. Extend `ThreadMetaRow`

Add optional/required fields already used by cockpit:

```ts
template_version?: number | null;
stage_started_at?: string | null;
```

### 0c. Extend plan/artifact row types if needed

`WorkflowCockpit.requirementStatus` filters `plans`/`artifacts` by `stage_id`. Today `thread-extras` plan SELECT omits `stage_id`.

- Add `stage_id: string | null` to `ThreadPlanRow` and `ThreadArtifactRow` if missing.
- Update SQL SELECTs in `thread-extras/route.ts` to include `stage_id` for plans and artifacts.

### 0d. `thread-extras/route.ts`

1. Extend the `thread_meta` SELECT to include `template_version`, `stage_started_at` (and any other columns already on the table that meta UI needs).
2. Add a Promise.all query:

```sql
SELECT id, thread_id, channel_id, template_id, template_version,
       event_type, from_state, to_state, actor, payload, created_at
  FROM thread_workflow_events
 WHERE thread_id = $1
 ORDER BY created_at ASC
 LIMIT 200
```

Wrap in `.catch(() => ({ rows: [] }))` like other optional tables so a missing table doesn't 500 the whole extras response.

3. Include `workflowEvents: rows` in the JSON response.

### 0e. `useThreadExtras`

- Add `workflowEvents: WorkflowEventRow[]` to `ThreadExtras` and initial empty state.
- Map `next.workflowEvents` in `refresh`.
- Map extended meta fields through (they ride on `meta`).

### 0f. Wire History tab if missing

In `[threadId]/page.tsx`, if `activeTab === "history"` is declared in `ThreadTabs` but not rendered, add:

```tsx
{activeTab === "history" && (
  <ThreadHistoryTab events={extras.workflowEvents} />
)}
```

Import `ThreadHistoryTab`. This unblocks verification of events data without mounting cockpit yet.

### Verify PHASE 0
```bash
npx tsc --noEmit
```
Manual: open any lifecycle thread → Network tab → `/api/channels/thread-extras?threadId=…` returns `workflowEvents` array and meta includes `template_version` / `stage_started_at` when present in DB.

If SQL errors on unknown columns: **STOP and ask Ben** (OVH schema may need a migration from `scripts/init-workflow-cockpit.mjs`).

**Commit:** `feat(channels): poll workflow events + meta fields for cockpit`

---

## PHASE 1 — Mount WorkflowCockpit + default Work tab

### Goal
ADR-007 UI contract starts being true: stage position visible without Overview; Work is default.

### 1a. Import and mount cockpit

In `ThreadContent` render stack (after header, before DoNow/GuideBar for now):

```tsx
{lifecyclePicked && meta && lc && (
  <WorkflowCockpit
    lifecycleKey={lifecycleKey}
    currentState={currentState}
    meta={meta}
    plans={plans}
    artifacts={extras.artifacts}
    steps={steps}
    activity={extras.activity}
    workflowEvents={extras.workflowEvents}
  />
)}
```

Pass the real `ThreadMetaRow` — if TypeScript complains about missing `template_version`/`stage_started_at`, fix types from PHASE 0 rather than casting away.

### 1b. Default tab

Change:

```ts
const [activeTab, setActiveTab] = useState<ThreadTabId>("conversation");
```

to:

```ts
const [activeTab, setActiveTab] = useState<ThreadTabId>("work");
```

### 1c. Cockpit-only fixes (minimal)

Only if mount breaks:
- If `meta.template_version` is string from PG, coerce with `Number(...)` either in extras mapping or cockpit.
- Do **not** redesign cockpit visuals.

### Verify PHASE 1
- Local or OVH: open a coding thread in `running` / `drafted`.
- Expect: cockpit stepper visible; Work tab selected; Conversation still reachable.
- `npx tsc --noEmit`

**Commit:** `feat(channels): mount WorkflowCockpit and default to Work tab`

---

## PHASE 2 — StageActionBar (unify GuideBar + Advance)

### Goal
One primary control for progressing the thread. Kill duplicate mental models.

### 2a. Create `src/app/channels/StageActionBar.tsx`

Client component. Props (minimum):

```ts
{
  lifecycleKey: string;
  currentState: string;
  enabledWorkflows: string[];
  channelId: string;
  threadId: string;
  isArchived?: boolean;
  // soft readiness inputs (same sources as cockpit)
  plans: ThreadPlanRow[];
  artifacts: ThreadArtifactRow[];
  steps: WorkflowStepRow[];
  // actions owned by parent
  onDone: () => void | Promise<void>;
  onPromote?: () => void;
  onScrollToExecution?: () => void;
}
```

### 2b. Behavior rules (implement exactly)

Use `nextStepSummary(lifecycleKey, currentState, enabledWorkflows)` and `LIFECYCLES`.

**Derive `primaryMode`:**

1. If archived → render null (or read-only chip only).
2. If `summary.isTerminal`:
   - If `lifecycleKey === "planning" && currentState === "accepted"` and `onScrollToExecution` → primary = **Execute plan** (calls `onScrollToExecution`).
   - Else if `onPromote` → primary = **Promote to project** (calls `onPromote`).
   - Else → show terminal chip only (no advance).
3. Else if there is at least one enabled `kind:"prompt"` workflow with `runsAt === mainNext` (same logic GuideBar/advance uses) → primary = **Run agent & advance** → `POST /api/channels/advance` with `{ threadId, channelId }`.
4. Else → primary = **Advance to {nextLabel}** → same endpoint/body as current `AdvanceStateButtons` (`POST /api/channels/transition` with `{ threadId, channelId, toState: mainNext, actor: "you" }` — copy exactly from `AdvanceStateButtons.tsx`).

**Soft readiness (client-side, non-blocking for v1 except UX):**
- Reuse the requirement checklist idea from `WorkflowCockpit` (`requirementStatus` logic). Either import a shared helper (preferred: extract `requirementStatus` + small `stageReadiness()` into `lifecycles.ts` or `stageReadiness.ts`) or duplicate minimally.
- If required (non-optional) requirements incomplete:
  - Still allow Advance/Run (server gates remain authoritative via transition).
  - Show amber helper text: `Blocked until: …` listing incomplete requirement labels.
  - Do **not** invent a new gate API in this phase.

**Working / error states:**
- Copy GuideBar patterns: working spinner; error + Retry.

**Secondary transitions:**
- Render alternate legal next states (excluding the primary `mainNext`) as smaller buttons, same confirm rules as `AdvanceStateButtons` (`CONFIRM_KINDS = done|dead|proven`).
- If only one legal next, no secondary row needed.

**Copy:**
- Show lifecycle label, state chip, optional `Step N of M`, and `summary.nextHint`.
- Primary button labels must be explicit (`Run agent & advance`, `Advance to Implement`, etc.) — **do not** use the opaque string `Do it for me`.

### 2c. Mount StageActionBar; remove duplicates

In `[threadId]/page.tsx`:
1. Render `<StageActionBar … />` directly under `WorkflowCockpit`.
2. **Remove** `<GuideBar … />` from the page.
3. Pass `onPromote` / `onScrollToExecution` the same way GuideBar received them.

In `ThreadOverviewTab.tsx`:
1. Remove `<AdvanceStateButtons … />` (and unused imports/props if they become dead).
2. Keep `<StateFlow />` in Overview for now (optional detail); cockpit is the primary stepper.
3. Clean props on Overview that only existed for Advance if unused.

Do **not** delete `GuideBar.tsx` / `AdvanceStateButtons.tsx` files in this phase (useful reference); just stop mounting them. Optional follow-up: mark `@deprecated` in a one-line comment at file top.

### 2d. DoNowBanner narrowing

Where `DoNowBanner` is rendered:

```tsx
{attention && !isArchived && attention.need === "triage" && (
  <DoNowBanner … />
)}
```

For `review` / `verify` / `gate` / `blocked`, StageActionBar + stage workspaces are enough. Do not scroll-hijack unless triage.

### 2e. Promote duplication

Ensure terminal promote does not also show a giant second Promote button from Overview/`PromoteStatusPanel` simultaneously.
- Prefer: StageActionBar owns the **start promote** click; `PromoteStatusPanel` shows only when `promotion` row exists (in progress / failed / succeeded) OR when already `promoted_to`.
- Adjust `showPromoteButton` / Overview props accordingly so you never see two identical “Promote to project” buttons on screen.

### Verify PHASE 2
Manual matrix:

| Thread state | Expect |
|---|---|
| coding `drafted` | Primary advances toward Implement (agent or transition per rules) |
| coding `running` with enabled prompt wf at next | Primary = Run agent & advance |
| planning `accepted` | Primary = Execute plan (scroll) |
| coding `accepted` | Primary = Promote (single button) |
| Overview tab | No Advance button row |
| Illegal / gated transition | Error text from API shown; Retry works |

```bash
npx tsc --noEmit
```

**Commit:** `feat(channels): StageActionBar replaces GuideBar and Overview advance`

---

## PHASE 3 — Live WorkRunsPanel above tabs

### Goal
Operator can monitor/cancel/retry without hunting the Work tab.

### 3a. Add `compact?: boolean` to `WorkRunsPanel`

When `compact`:
- Shorter header (`Live run` instead of long description)
- Show at most the newest 3 attempts
- Keep cancel/retry actions

Default `compact={false}` preserves Work-tab behavior.

### 3b. Detect “should pin above tabs”

In `ThreadContent`, either:
- Reuse panel’s internal fetch (panel already loads `/api/work-runs?threadId=`), **or**
- Lift a tiny hook `useWorkRuns(threadId)` shared by page + panel.

Simplest acceptable approach for pi:
1. Always render:

```tsx
<WorkRunsPanel threadId={threadId} compact />
```

above tabs (panel already returns `null` when `!runs.length && !error`).

2. Keep `<WorkRunsPanel threadId={threadId} />` inside `ThreadWorkTab` for full history.

If double-fetch bothers you, extract shared hook — nice-to-have, not required.

### 3c. Refresh coupling

When StageActionBar finishes advance/run, existing `onDone → extras.refresh()` stays. WorkRunsPanel polls on its own; ensure its `load()` runs on mount and on an interval while page visible (it already does — do not break that).

### Verify PHASE 3
- From Conversation or Work, trigger `@pi` or Run agent & advance.
- Compact run panel appears above tabs with status + stop/retry.
- Work tab still shows full Execution attempts section.

**Commit:** `feat(channels): pin live work runs above thread tabs`

---

## PHASE 4 — Identity + Home agents signal + install prompt

### Goal
Stop looking like a Finance app; make agent-down obvious; stop install banner covering work.

### 4a. `src/app/layout.tsx`

Change metadata:
- `title: "Activity"`
- `description:` something like `"Workflow and agent activity dashboard"`
- `appleWebApp.title: "Activity"`

Do not change themeColor / manifest path unless required for title consistency. If `public/manifest.json` still says Finance, update `name` / `short_name` to `Activity` too.

### 4b. `src/app/install-prompt.tsx`

Before `setShow(true)`, wait **8000ms** (timeout cleared on unmount). Keep dismissed localStorage key behavior. Do not change placement radically; delay alone fixes first-paint obstruction.

### 4c. `HomeDashboard.tsx` agents-down banner

When `data.summaryCounts.agentsDown` (or `!data.agents.runtimeOk`):
- Render a prominent banner at top of Home content (above count pills is fine):

Title: `Agent runtime is down`  
Body: use existing copy cues (`Paseo unavailable` / similar from System card)  
CTA link: `/ops/config?tab=models` (same as current Agents pill href)

Keep the existing Agents count pill; banner is additive.

### Verify PHASE 4
- Browser tab title / PWA name is Activity.
- Fresh session: install banner does not appear for first ~8s.
- With agents down (current OVH often is): Home shows banner.

**Commit:** `fix(pwa): Activity branding, delayed install prompt, agents-down banner`

---

## PHASE 5 — End-to-end verification + OVH ship checklist

### 5a. Local static checks
```bash
npx tsc --noEmit
# if repo has a preferred lint:
# npm test   # only if existing and fast; do not invent a new suite
```

### 5b. Manual QA (local or OVH)

Use this checklist; all boxes required before calling Phase 1 done:

- [ ] Coding thread opens with **Work** selected
- [ ] **WorkflowCockpit** visible with stage path
- [ ] **StageActionBar** is the only advance/run control (no GuideBar; no Overview Advance)
- [ ] Only one Promote CTA when terminal
- [ ] DoNow appears for unscoped issue triage; not for ordinary coding review
- [ ] Run agent / `@pi` shows **compact WorkRunsPanel** above tabs
- [ ] Conversation tab still sends replies and triggers mentions
- [ ] History tab shows workflow events (if any)
- [ ] Home shows agents-down banner when runtime unhealthy
- [ ] App title is Activity; install prompt delayed

### 5c. Deploy (when Ben says go)

```bash
# from dashboard/
# commit everything first (deploy refuses dirty unless OVH_ALLOW_DIRTY=1)
./scripts/deploy-ovh.sh
```

Then:
1. `curl -sk -o /dev/null -w '%{http_code}\n' https://ovh-vps.taila1553c.ts.net:8446/channels`
2. Hard-refresh phone PWA / desktop
3. Spot-check one live thread from Home → Active

### 5d. Rollback

Use existing `scripts/rollback-ovh.sh` / release activate scripts if deploy is bad. UI-only rollback is safe; no DB down-migration in this BUILD.

**Commit:** only if QA fixes were needed; otherwise no extra commit.

---

## Out of scope (do NOT do in this BUILD)

- Rewriting `trigger/route.ts` or work-run worker hosting
- Merging advance+transition into one API
- Auto-continue to next stage after success (Phase 2 product work)
- Hiding Finance / Personal from bottom nav
- New lifecycle templates / Workflow Registry editor changes
- Redesigning stage workspaces (CodingExecutionWorkspace, StageReview, etc.)
- Theme-lab / ProtoThemePicker changes
- Adding React Flow or kanban boards

---

## File touch map (expected)

| File | Phase | Action |
|---|---|---|
| `src/app/api/channels/thread-extras/route.ts` | 0 | SELECT meta fields + workflow events + stage_id |
| `src/app/channels/shapes.ts` | 0 | `WorkflowEventRow`, meta/plan fields, extras type |
| `src/app/channels/[channelId]/[threadId]/page.tsx` | 1–3 | mount cockpit/bar/runs; default tab; remove GuideBar; history tab; DoNow narrow |
| `src/app/channels/WorkflowCockpit.tsx` | 1 | mount only; tiny type fixes if needed |
| `src/app/channels/StageActionBar.tsx` | 2 | **create** |
| `src/app/channels/stageReadiness.ts` (optional) | 2 | extract shared readiness helper |
| `src/app/channels/ThreadOverviewTab.tsx` | 2 | remove AdvanceStateButtons; promote button de-dupe |
| `src/app/channels/WorkRunsPanel.tsx` | 3 | `compact` prop |
| `src/app/channels/ThreadWorkTab.tsx` | 3 | keep full panel |
| `src/app/channels/ThreadHistoryTab.tsx` | 0/1 | wire if unused |
| `src/app/layout.tsx` | 4 | Activity title |
| `public/manifest.json` | 4 | name/short_name if Finance |
| `src/app/install-prompt.tsx` | 4 | 8s delay |
| `src/app/home/HomeDashboard.tsx` | 4 | agents-down banner |

Untouched on purpose: `trigger/route.ts`, `advance/route.ts` logic (call only), finance routes, bottom-nav IA.

---

## Implementation order for pi (checklist)

```
[ ] PHASE 0 — extras plumbing + WorkflowEventRow + History wire
[ ]   tsc clean; extras JSON has workflowEvents
[ ]   commit
[ ] PHASE 1 — mount WorkflowCockpit; default tab work
[ ]   visual check coding thread
[ ]   commit
[ ] PHASE 2 — StageActionBar; remove GuideBar + Overview Advance; narrow DoNow; de-dupe Promote
[ ]   matrix QA in PHASE 2 verify
[ ]   commit
[ ] PHASE 3 — compact WorkRunsPanel above tabs
[ ]   trigger run; confirm pin + Work tab still works
[ ]   commit
[ ] PHASE 4 — branding + install delay + Home banner
[ ]   commit
[ ] PHASE 5 — full QA checklist; deploy only if Ben requests
```

---

## When stuck

1. Re-read the CRITICAL GOTCHAS.
2. Prefer the smallest change that restores the ADR-007 contract.
3. Ask Ben before: engine recreate, new SQL migrations, deleting GuideBar files, changing advance API contracts, or expanding into Phase-2 product auto-flow.
