# BUILD SPEC — Proto IA align (post-Tududi / post-graph teardown)

**Status:** ready to implement  
**Audience:** pi agent  
**Workdir:** `/Users/bencharney/activity-feed/dashboard`  
**Branch:** `theme-prototype` (proto sandbox — keep changes local to proto routes + bottom-nav sketch unless noted)  
**Depends on:** `PLAN-proto-ui.md` (IA lock) · graph Continuity soft-off already done  
**Index:** `PLAN-workflow-next.md`  
**Out of scope:** wiring live data to proto-5/10 · promoting protos onto real pages · middleware swap · OVH deploy · Continuity UX · Tududi deep-linking

---

## Goal

Make the chosen protos and mobile shell **match the locked post-teardown IA** so later data-wiring and promotion don’t rebuild graph-era or planning-clone surfaces.

Locked IA:

| Surface | Decision |
|---------|----------|
| Bottom nav | **Home / Channels / Projects / Ops** |
| Projects | Thin Tududi window + existing repo/execution list (`/projects`) |
| Home | **Needs You + In Motion + Channels only** — no Ready to Execute / Continuity promote |
| Thread Work | **Execution / stage steps only** — planning todos stay in Tududi |
| Split | Tududi = plan · AD = execute |

---

## Settled decisions

| Topic | Choice |
|---|---|
| Nav | Four tabs. Add Projects; keep Ops (notifications/config live there). |
| Proto Home (4) | Remove Ready to Execute section entirely. Keep Needs You / In Motion / Channels. |
| Proto Thread (10) | Relabel mock checklist as execution/stage steps (not “tasks” that sound like Tududi). Keep stage strip + Work tab. |
| Proto Channels (5) | No IA change this BUILD — leave layout; mock data OK. |
| `/projects` content | Do **not** redesign TududiPlanningPanel here — only make the tab reachable from nav sketch / proto shell. |
| Real pages | Do **not** rewrite `HomeDashboard.tsx` or real thread page in this BUILD (promote later). |
| Continuity | Already cancelled — do not touch Continuity origin specs. |

---

## ⚠️ CRITICAL GOTCHAS

1. **Proto-only middleware** (`src/middleware.ts`) redirects all non-`/proto-*` routes to `/proto-1`. Bottom-nav links to `/`, `/channels`, `/projects`, `/ops` **will redirect away from protos** on this Tailscale design instance. For this BUILD: either (a) add a **proto-local nav** used only on proto pages, with links to `/proto-4`, `/proto-5`, `/projects` stub note, or (b) temporarily allow `/projects` + `/ops` through middleware **only if** Ben confirms this host is not the live OVH app. Prefer **(a)** — proto-local nav sketch — unless Ben says otherwise.
2. Branch is `theme-prototype`. Don’t assume OVH production is this tree. No `deploy:ovh` in this BUILD.
3. Proto-4 still reads `data.approvedPlans` for Ready to Execute — delete the section/render; unused variable OK for now (don’t strip API).
4. Proto-10 checklist copy currently looks like planning todos (“Rewrite proto-4…”) — rename heading to something like **Execution steps** / **Stage work** and keep items as execution-ish stubs.
5. Do not invent Tududi API calls inside protos in this BUILD.
6. Real thread page is ~1000 lines with `StageActionBar` / `DoNowBanner` — **out of scope**; proto-10 is a visual/IA sketch only.
7. Commit only if Ben asks.

---

## PHASE 0 — Audit (read-only)

1. Open `PLAN-proto-ui.md` IA lock section — confirm matches this file.  
2. Skim `proto-4/page.tsx` for Ready to Execute.  
3. Skim `proto-10/page.tsx` Work tab checklist heading/copy.  
4. Skim `bottom-nav.tsx` — currently Home / Channels / Ops.  
5. Confirm `middleware.ts` still proto-only.

**Commit:** none.

---

## PHASE 1 — Proto-4 Home: drop Ready to Execute

**File:** `src/app/proto-4/page.tsx`

1. Remove the **Ready to Execute** section UI (heading + `plans` map).  
2. Stop requiring `approvedPlans` for render (ok if hook still returns it).  
3. Leave Needs You / In Motion / Channels as-is (polish later, not this BUILD).

**Verify:** `/proto-4` shows three content regions only (plus header). No “Ready to Execute”.

---

## PHASE 2 — Proto-10 Work: execution steps, not planning tasks

**File:** `src/app/proto-10/page.tsx`

1. Rename checklist card title from task/todo language to **Execution steps** (or **Stage work**).  
2. Optionally tweak mock item copy so it reads as execution work, not planning backlog.  
3. Do **not** add Tududi fetch.

**Verify:** Work tab checklist clearly means steps for the current thread stage, not a GTD inbox.

---

## PHASE 3 — Nav sketch: Home / Channels / Projects / Ops

**Preferred (safe under proto middleware):**

Add a small **ProtoShellNav** (or extend `proto-nav.tsx`) visible on proto-4 / proto-5 / proto-10:

| Tab | Href |
|-----|------|
| Home | `/proto-4` |
| Channels | `/proto-5` |
| Projects | `#` or `/proto-4` with muted “live: /projects” note — **do not** fight middleware unless Ben unlocks it |
| Ops | same treatment — muted “live: /ops” |

Label Projects clearly so the IA is visible even if the live `/projects` page isn’t reachable in the sandbox.

**Optional (only if Ben confirms this host is design-only):**  
Update `src/app/bottom-nav.tsx` to four tabs and whitelist `/projects` + `/ops` (+ maybe `/`) in middleware. Document the change in the PR/notes.

**Verify:** On a phone-width proto page, four destinations are visible and match the lock.

---

## PHASE 4 — Doc sync

1. Ensure `PLAN-proto-ui.md` IA lock says **Home / Channels / Projects / Ops**.  
2. Ensure `PLAN-workflow-next.md` points at this BUILD as step 1.  
3. Leave `PLAN-home-continuity-context-BUILD.md` cancelled.

**Verify:** Index docs don’t still say “Ops demoted”.

---

## Done when

- [ ] Proto-4 has no Ready to Execute  
- [ ] Proto-10 Work checklist = execution/stage language  
- [ ] Four-tab IA visible in proto shell nav (Projects + Ops)  
- [ ] No Continuity / graph promote surfaces reintroduced  
- [ ] No live-data wiring, middleware promote, or OVH deploy unless Ben asked  
- [ ] Short note in chat: what changed + how to view on Tailscale `:8450`

---

## Explicitly deferred (next BUILD, not this one)

- Wire proto-5 / proto-10 to Electric / `useThreadExtras`  
- Promote protos onto real `/`, `/channels`, thread pages  
- Strip `approvedPlans` from `/api/home/overview` or HomeDashboard dead Continuity types  
- Drop `graph_*` / `thread_plans` tables  
- Deep Tududi ↔ thread linking  
