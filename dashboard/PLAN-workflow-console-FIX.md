# BUILD SPEC — Workflow console residual fixes (for pi)

**Status:** ready to implement  
**Audience:** pi agent — fix QA bugs found on OVH after workflow-console BUILD ship  
**Workdir:** `/Users/bencharney/activity-feed/dashboard`  
**Depends on:** `PLAN-workflow-console-BUILD.md` (Phases 0–4 already shipped + deployed as `20260729T162950Z-39b82835ebc3-34232`)

## Context (why this exists)

Visual QA on the live coding thread + Home confirmed the console BUILD works, but left these **user-facing bugs**:

1. **CodingExecutionWorkspace lies on `running`** — still shows “Start implementing →” / “advances the thread to Implement” when stage is already Implement.
2. **False “Blocked until: Implementation plan”** — StageActionBar/cockpit soft readiness says the plan is missing while Work tab shows ~15 tasks. Root cause: `requirementStatus` only counts plans with `stage_id` null or `=== currentState`. Handoff plans are tagged `drafted`, so on `running` they are ignored.
3. **Theme Lab floater** (`ProtoThemePicker`) is mounted in root `layout.tsx` and clutters every OVH page.
4. **Stale “GuideBar” copy** — Home / attention / advance step labels still tell operators to use GuideBar (removed).

**Out of scope for this BUILD:** fixing agents-down / Paseo root cause; continuous stage-loop product work; redesigning Theme Lab itself.

Do phases in order. Commit after each phase. Deploy only if Ben asks.

---

## ⚠️ CRITICAL GOTCHAS

1. **Poll, don’t stream.** No new Electric shapes.
2. **Do not rewrite `trigger/route.ts`.**
3. **Keep server gates authoritative.** Soft readiness is UX only; do not invent a new gate API.
4. **Mobile-first.** No desktop-only hover for primary actions.
5. **Theme Lab:** do not delete the component/files — only stop mounting it in production layout (or gate it). Theme-lab route/tools can remain for local use.
6. Ask Ben before engine recreate / DDL.

---

## Settled decisions

| Bug | Fix |
|---|---|
| Coding workspace on `running` | Show **in-progress** UI (no Start CTA). Start CTA only when `state === "drafted"`. |
| Plan readiness false negative | Shared `requirementStatus`: for `source:"task"`, count plans whose `stage_id` is null, equals current state, **or** equals any earlier state on the lifecycle main path (so drafted plans count during `running`). Keep title length ≥8. Drop the brittle `sort_order === index` every-item check (it fails as soon as any gap/reorder exists). Require `stagePlans.length >= 1` (not ≥2). |
| Theme Lab on OVH | Remove `<ProtoThemePicker />` from `src/app/layout.tsx` production path. Prefer: only render when `process.env.NODE_ENV === "development"` **or** `localStorage` key `theme-lab=1` (client-only). Default on OVH prod: hidden. |
| GuideBar strings | Rename user-visible strings to Stage Action Bar / “stage controls”. Rename advance workflow step label from `GuideBar advance` → `Stage advance`. Actor suffix `(GuideBar)` → `(StageActionBar)`. |

---

## PHASE 1 — CodingExecutionWorkspace: stop lying on Implement

### File
`src/app/channels/CodingExecutionWorkspace.tsx`  
(and only if needed) `[channelId]/[threadId]/page.tsx` `showCodingWorkspace` predicate.

### Required behavior

When `meta.state === "drafted"` (Define):
- Keep current “Start implementing →” flow.

When `meta.state === "running"` (Implement):
- **Do not** show primary “Start implementing →”.
- Show an in-progress panel instead, e.g.:
  - Title: `Implementation in progress` (or similar)
  - Body: point at Work tab / StageActionBar (“Use Advance to Verify when ready” / “Agent runs appear above when active”)
  - Optional secondary: link “See work tab” (already exists)
- If an agent/work-run is active, prefer “Agent running…” copy; if not, “No agent is running. Continue tasks or Advance when ready.”

Pass `currentState` (or derive from `meta.state`) into the workspace if not already available.

`showCodingWorkspace` may still include both `drafted` and `running` so the in-progress panel remains visible — that is fine. What must change is the **CTA and copy**, not necessarily the mount condition.

### Verify
Open OVH coding thread in `running` (e.g. notifications execution thread):
- No “Start implementing →”
- No copy claiming start will advance **to** Implement
- StageActionBar still shows Advance to Verify

**Commit:** `fix(channels): CodingExecutionWorkspace in-progress UI for running stage`

---

## PHASE 2 — Fix soft readiness for handed-off plans

### Files
- `src/app/channels/stageReadiness.ts` (canonical)
- `src/app/channels/WorkflowCockpit.tsx` — **must use the shared helper**, not a duplicate local `requirementStatus`. If cockpit still has its own copy, delete it and import from `stageReadiness.ts`.

### Change `requirementStatus` for `source === "task"`

Replace the current logic with:

1. Build allowlist of stage ids: `currentState` + all states **before** it on `mainPathOrder(LIFECYCLES[lifecycleKey])` (need lifecycleKey — add it as a parameter to `requirementStatus` / `stageReadiness` if missing).
2. `stagePlans = plans.filter(p => !p.stage_id || allowlist.includes(p.stage_id))`
3. Complete if `stagePlans.filter(p => p.title.trim().length >= 8).length >= 1`

Do **not** require `sort_order === index` for every plan.

Update all call sites of `requirementStatus` / `stageReadiness` for the new signature.

### Verify
Same coding/`running` thread with drafted-tagged plans:
- Cockpit “Ready when” should show Implementation plan ✓ (or N/N complete)
- StageActionBar must **not** show `Blocked until: Implementation plan`

**Commit:** `fix(channels): count prior-stage plans in task readiness`

---

## PHASE 3 — Hide Theme Lab on production OVH

### File
`src/app/layout.tsx` (and optionally `src/components/ProtoThemePicker.tsx`)

### Change
- Stop unconditionally rendering `<ProtoThemePicker />` on every page in prod.
- Acceptable patterns (pick one):
  - **A (preferred):** render only if `process.env.NODE_ENV === "development"`
  - **B:** client gate: show only when `localStorage.getItem("theme-lab") === "1"`

Do not remove theme-lab routes/docs under `ops/themes` or `themes/` unless they are only reachable via the floater.

### Verify
Hard-refresh OVH Home + thread: no Theme Lab panel / “Apply” floater.  
Local `next dev` may still show it if using pattern A.

**Commit:** `fix(pwa): hide ProtoThemePicker outside development`

---

## PHASE 4 — Purge user-visible “GuideBar” strings

### Files (exact hits from ripgrep — update all user-visible ones)

| File | Change |
|---|---|
| `src/app/channels/attentionGuide.ts` | CTA `Unblock in GuideBar` → `Unblock in stage controls` (or `Unblock via Stage Action Bar`) |
| `src/app/home/HomeDashboard.tsx` | fallback nextStep mentioning GuideBar → Stage Action Bar / stage controls |
| `src/app/api/home/overview/route.ts` | same for promotion failed-gate nextStep |
| `src/app/api/channels/advance/route.ts` | step label `GuideBar advance` → `Stage advance`; actor `(GuideBar)` → `(StageActionBar)` |

Comments in deprecated `GuideBar.tsx` / lifecycles “GuideBar helper” section may stay (code comments). Do not rename the deprecated file in this BUILD.

### Verify
- Home “In motion” for newly advanced threads shows `Stage advance` (old rows may still say GuideBar advance — OK).
- No attention CTA text says GuideBar.

**Commit:** `fix(copy): replace GuideBar user strings with Stage Action Bar`

---

## PHASE 5 — QA + optional deploy

### Checklist
- [ ] Coding `running` thread: no Start implementing CTA; readiness not falsely blocked
- [ ] Coding `drafted` thread (if available): Start implementing still works
- [ ] OVH: Theme Lab gone
- [ ] New advance creates step labeled `Stage advance`
- [ ] `npx tsc --noEmit` — if pre-existing errors remain outside these files, note them; do not expand scope to fix electric-circuits package errors unless introduced by this work

### Deploy
Only when Ben says go: `./scripts/deploy-ovh.sh` (prefer clean tree; avoid `OVH_ALLOW_DIRTY=1` unless Ben allows). Hard-refresh PWA after.

---

## Out of scope

- Fixing `agentsDown` / Paseo / model proxy env
- Unifying advance+transition APIs
- Continuous auto stage-loop (product Phase 2)
- Deleting GuideBar.tsx / AdvanceStateButtons.tsx files
- Broader IA diet (Finance/Personal nav)

---

## Implementation order for pi

```
[ ] PHASE 1 — CodingExecutionWorkspace in-progress on running
[ ]   commit
[ ] PHASE 2 — shared readiness counts prior-stage plans; cockpit uses shared helper
[ ]   commit
[ ] PHASE 3 — hide Theme Lab on prod
[ ]   commit
[ ] PHASE 4 — GuideBar → Stage Action Bar copy + advance step label
[ ]   commit
[ ] PHASE 5 — QA; deploy only if Ben requests
```

## When stuck

Prefer the smallest UX-correct change. Ask Ben before changing lifecycle requirement definitions in `lifecycles.ts` (prefer fixing the readiness helper, not deleting the requirement).
