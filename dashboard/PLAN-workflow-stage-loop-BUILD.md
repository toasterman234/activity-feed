# BUILD SPEC — Continuous stage loop (for pi)

**Status:** ready to implement  
**Audience:** pi agent  
**Workdir:** `/Users/bencharney/activity-feed/dashboard`  
**Depends on:** `PLAN-workflow-console-BUILD.md` + `PLAN-workflow-console-FIX.md` (must be on OVH before claiming done)  
**Index:** `PLAN-workflow-next.md`

## Goal

Make stage-to-stage work feel continuous:

> Enter stage → do work in the stage workspace → readiness goes green → primary CTA advances → **next stage workspace takes over** (prior stage collapses). Chat stays evidence, not the control plane.

Pilot lifecycle: **`coding`** only. Do not redesign all lifecycles in this BUILD. Planning/issue/research get the same *pattern* only if cheap follow-ons after coding ships.

## Why this exists

Console BUILD mounted cockpit + StageActionBar, but stages still feel disconnected:

- Some stages have rich workspaces (`CodingExecutionWorkspace`, `StageReviewWorkspace`); others are passive.
- After advance, UI does not clearly “enter” the next stage (no focus/scroll/collapse).
- Soft readiness and workspaces can disagree with each other.
- Operator still mixes StageActionBar + Coding “Start” + chat `@pi`.

Related ADRs: ADR-007, ADR-021.

---

## ⚠️ CRITICAL GOTCHAS

1. Poll extras only — no new live shapes (ADR-003).
2. Do not rewrite `trigger/route.ts` (1400 lines). Call existing advance/transition APIs.
3. Server `exitGates` remain authoritative; soft readiness is UX.
4. Mobile-first; keep zinc look; no Theme Lab regressions.
5. Prefer extracting a `ThreadStageStack` rather than growing `[threadId]/page.tsx` further.
6. Commit after each phase. Deploy only when Ben asks.

---

## Settled decisions

| Topic | Choice |
|---|---|
| Pilot | `coding` lifecycle only |
| After successful advance | Scroll StageActionBar + active workspace into view; collapse completed stages into a compact strip |
| Stage ownership | Exactly **one** expanded workspace for current state; prior stages = collapsed summary chips |
| Passiveing | Keep StageActionBar as sole advance/run control; workspaces may call the same advance helper, not a second semantics |
| Passiveing modules | Add/adjust modules in `lifecycles.ts` for coding stages that are still passive (`testing`, `review` if needed) |
| Chat | Unchanged; still available |

---

## PHASE 0 — Deploy FIX + baseline inventory

1. If OVH does not yet show FIX behavior (no Theme Lab; no false “Blocked until: Implementation plan” on the notifications coding thread; CodingExecutionWorkspace in-progress on `running`), deploy FIX first (`./scripts/deploy-ovh.sh` when Ben allows).
2. Write a short inventory comment at top of this file’s progress (or `progress.md` bullet) listing, for each coding state, which workspace mounts today:

| State | Label | Workspace today | Gap |
|---|---|---|---|
| drafted | Define | CodingExecutionWorkspace (start) | OK-ish |
| running | Implement | CodingExecutionWorkspace (in-progress after FIX) | needs task focus + advance coupling |
| testing | Verify | mostly passive / workflows as commands | needs verify workspace |
| review | Review | weak | needs review entry or reuse guided-review earlier |
| verified | Ready to ship | StageReviewWorkspace (guided-review) | OK |
| accepted | Shipped | terminal | OK |

**Commit:** only if you add an inventory note file Ben wants; otherwise no commit — proceed to Phase 1.

---

## PHASE 1 — `ThreadStageStack`: one expanded stage

### Create `src/app/channels/ThreadStageStack.tsx`

Responsibilities:

1. Know `lifecycleKey`, `currentState`, and which workspace components to show.
2. Render **current** stage workspace expanded.
3. Render **completed** main-path stages (before current on `mainPathOrder`) as collapsed one-line chips: `✓ Define · done` (tap expands read-only summary later — v1 can be non-interactive chips).
4. Do **not** render future stages as full workspaces.

Move the existing conditional mounts from `[threadId]/page.tsx` into this stack:

- `CodingExecutionWorkspace`
- `StageReviewWorkspace` / guided-review
- `WorkflowStageModules` catch-all
- `ExecutionHandoffWorkspace` (planning — only if still mounted for coding paths; usually planning-only)

Keep `WorkflowCockpit` + `StageActionBar` **above** the stack (already there).

### After advance (`StageActionBar.onDone` / parent refresh)

In page or stack:

```ts
// after extras.refresh()
requestAnimationFrame(() => {
  document.getElementById("stage-action-bar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("active-stage-workspace")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
```

Add stable ids: `id="stage-action-bar"` on StageActionBar root; `id="active-stage-workspace"` on expanded workspace wrapper.

### Verify
Advance Define→Implement on a test coding thread (or use existing): stack shows Implement expanded; Define collapsed; viewport moves to action bar/workspace.

**Commit:** `feat(channels): ThreadStageStack with one expanded stage`

---

## PHASE 2 — Coding Verify workspace (`testing`)

### Problem
`testing` has command workflows / gate requirements but no inline workspace — operator must guess.

### Add module + workspace

1. In `lifecycles.ts` coding `testing` state, add a module e.g.:

```ts
{
  id: "verify-checks",
  type: "verification", // already in StageModuleType union
  label: "Run verification",
  config: {
    // list workflow ids that are command+gates at testing, or "run enabled gated commands"
  }
}
```

2. Implement or extend a `VerificationWorkspace` (new file under `channels/`) that:
   - Lists required checks from stage requirements + enabled gated workflows at `testing`
   - Primary button: **Run checks** → triggers the same path StageActionBar would use for agent/command advance into/through testing **or** calls existing transition/advance after documenting which
   - Shows last workflow step / work-run status for those checks
   - When soft readiness complete, copy: “Ready — use Advance to Review”

Prefer reusing existing advance/transition rather than new APIs. If command workflows only run on transition into state, document that Run checks = `POST /api/channels/advance` or transition to next — **match current server behavior**; do not invent a parallel command runner.

3. Wire module in `WorkflowStageModules` / ThreadStageStack for `type === "verification"`.

### Verify
On a coding thread you can move to `testing` (or seed): Verify workspace visible; checks status visible; StageActionBar still sole legal advance.

**Commit:** `feat(channels): verification workspace for coding testing stage`

---

## PHASE 3 — Coding Review entry (`review` → `verified`)

### Problem
`review` is a wait state with little inline UX before `verified`’s guided-review.

### Approach (pick the smaller one that works)

**Preferred:** Treat `review` as a light “ready for ship review” panel:
- Summary of latest artifacts / open tasks
- Primary: **Start ship review** → transition to `verified` (manual transition API) which mounts existing `StageReviewWorkspace`

**Alternative:** Attach guided-review module to `review` instead of `verified` (bigger lifecycle churn — avoid unless necessary).

Do not duplicate full StageReviewWorkspace on both states.

### Verify
From `review`, one CTA moves to `verified` and ship review workspace appears expanded.

**Commit:** `feat(channels): review-stage entry into ship review`

---

## PHASE 4 — Couple workspaces to StageActionBar (single brain)

1. Extract a tiny shared client helper `advanceThread({ threadId, channelId, mode: "agent" | "transition", toState? })` used by StageActionBar and any workspace primary buttons (Start implementing, Run checks, Start ship review).
2. Workspaces must not call different semantics silently — if they advance, they go through the helper.
3. When soft readiness incomplete, workspace primary may still offer “work actions” but Advance remains gate-aware as today.

### Verify
No divergent advance paths; network tab shows only `/api/channels/advance` or `/api/channels/transition` as today.

**Commit:** `refactor(channels): shared advanceThread helper for bar + workspaces`

---

## PHASE 5 — QA matrix (coding) + optional deploy

Manual matrix on OVH (or local against OVH DB if that is your setup):

| From → To | Expect |
|---|---|
| drafted → running | Implement workspace expands; Define collapses |
| running → testing | Verify workspace expands |
| testing → review | Review entry panel |
| review → verified | Ship review workspace |
| verified → accepted | Terminal; promote CTA on bar |

Also: Conversation still works; History shows transitions; mobile width usable.

**Commit:** only for QA fixes. Deploy on Ben’s request.

---

## Out of scope

- Planning/research/issue full parity (follow-up BUILD)
- Auto-advance without user click
- agentsDown / paseo install (see `PLAN-agent-runtime-health-BUILD.md`)
- Bottom nav IA diet (see `PLAN-workflow-ia-diet-BUILD.md`)

---

## Implementation checklist

```
[ ] PHASE 0 — FIX on OVH + coding stage inventory
[ ] PHASE 1 — ThreadStageStack + scroll-on-advance
[ ]   commit
[ ] PHASE 2 — verification workspace for testing
[ ]   commit
[ ] PHASE 3 — review → verified entry
[ ]   commit
[ ] PHASE 4 — shared advanceThread helper
[ ]   commit
[ ] PHASE 5 — QA matrix; deploy if Ben asks
```
