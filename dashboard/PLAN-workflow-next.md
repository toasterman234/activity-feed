# PLAN — Workflow console next (index for pi / Ben)

**Status:** active sequencing doc  
**Date:** 2026-07-29 (updated after Ben visual critique → density BUILD)  
**Workdir:** `/Users/bencharney/activity-feed/dashboard`

## Where we are

| Track | Spec | Status |
|---|---|---|
| Console shell / stage loop / runtime health | `PLAN-workflow-*-BUILD.md` | ✅ shipped |
| IA diet | `PLAN-workflow-ia-diet-BUILD.md` | 🟡 partial — Personal kept |
| Home usable (Needs you ≠ metadata theater) | `PLAN-home-usable-BUILD.md` | 🟡 agent ran — verify on live |
| Graph Continuity / ActiveGraph soft-off | teardown session 2026-07-29 | ✅ soft-off + Tududi cutover |
| Proto UI (4 / 5 / 10 shadcn) | `PLAN-proto-ui.md` | 🟡 design sandbox; IA locked |
| Proto promote (visual) | `PLAN-proto-promote-BUILD.md` | 🟡 code-complete — **pending Ben sign-off** |
| **Visual density + theme unify** | **`PLAN-visual-density-BUILD.md`** | ✅ **COMPLETE** — Phases 0→5 implemented, 200 verified, pending Ben sign-off |
| Home / Continuity origin context | `PLAN-home-continuity-context-BUILD.md` | ❌ **cancelled** — Continuity retired |
| Fleet page simplify | `PLAN-fleet-simplify.md` | 🟢 implemented — FleetPage simplified, RegistryPanel → /ops/registry |
| Handoff (critique session) | `HANDOFF-proto-promote-20260729.md` | context for polish |

## Locked product IA (post-Tududi)

- **Tududi** = shared planning authority  
- **AD PWA** = execution (channels / threads / lifecycles / stage cockpit / runs) + thin Projects window into Tududi  
- **Bottom nav:** Home / Channels / Projects / Ops  
- **Home:** Needs You + In Motion + Channels only (no Ready to Execute / Continuity promote)  
- **Thread Work:** execution / stage steps only (planning todos stay in Tududi)

Source of truth detail: `PLAN-proto-ui.md` → “Post-teardown IA lock”.

**Tududi project:** [activity-dashboard-pwa](http://100.101.106.60:3002/project/w3yg7n93tat3t6p) (`w3yg7n93tat3t6p`) — remaining stages/tasks live there (wire → promote → cleanup).

## Recommended agent order

```
1. Align protos to IA lock — `PLAN-proto-ia-align-BUILD.md` ✅
2. Wire protos to live data — `PLAN-proto-wire-data-BUILD.md` ✅ (2026-07-30)
3. Promote to real pages — `PLAN-proto-promote-BUILD.md` 🟡 code-complete; Ben not signed off
4. Visual density + theme unify — `PLAN-visual-density-BUILD.md` 🔴 NEXT
5. Verify PLAN-home-usable on live if Needs You still feels like form gates
6. Post-promote cleanup (delete proto-4/5/10, middleware final, OVH deploy if Ben asks)
```

## wire-data ✅ closed (2026-07-30)

- Proto 4 (Minimal List): 200 — Home shadcn rewrite, useHomeOverview, no Electric.
- Proto 5 (Channel Thread List): 200 — Electric shapes + useChannelRows, useMessageRows, useChannelThreadMeta, derive threads from root messages.
- Proto 10 (Thread View): 200 — Electric shapes + useThreadExtras (steps/activity/meta/artifacts/promotion), stage stack from workflow events, 4 tabs.
- dev script → `next dev --webpack` (Turbopack can't resolve raw .ts exports).
- `@tanstack/db` / `@tanstack/react-db`: npm packages (was broken pnpm file: symlinks).
- react-scan alias applied in dev too (was prod-only).
- Test channel: `1ddfb1c5-bb2a-4abd-b4e1-ab7c644faa1e` (test-channel), thread: `f0fe319d-e85d-4e3c-bd75-83952024a12c` (test).
- Follow-up: Turbopack dist build for @electric-circuits/client + protocol (tsup).

## promote BUILD 🟡 (2026-07-31) — pending Ben sign-off

- **Spec:** `PLAN-proto-promote-BUILD.md` — 6 phases: bottom-nav 4 tabs, HomeDashboard strip, proto-5 visual on channels, proto-10 shell on thread (keep StageActionBar/DoNowBanner), delete unused protos, middleware disable.
- **Tududi stage:** `promote` on project `w3yg7n93tat3t6p`.
- **Done:** Phase 1 (nav) ✅, Phase 2 (HomeDashboard strip) ✅, Phase 3 (channels — already IA-aligned, visual already close), Phase 4 (thread proto-10 shell) ✅, Phase 5 (delete unused protos + middleware disable) ✅.
- **Pending:** Ben eyeball / polish — do **not** treat as signed off. See density BUILD.

## visual-density BUILD ✅ (2026-07-31) — pending Ben sign-off

- **Spec:** `PLAN-visual-density-BUILD.md`
- **Why:** Ben live critique — Home sparse; Channels/Threads ≠ chosen proto feel; Projects still zinc.
- **Locked:** Home Channels = hybrid **C**; Channels index bolder + waiting signals; Members tucked; Thread hybrid; Projects theme-align + simplify.
- **Kickoff:** read that BUILD + `HANDOFF-proto-promote-20260729.md`; Phases 0→5; no deploy; no proto delete.

## Non-goals (still deferred)

- Full Finance / visual theme redesign  
- Re-binding evidence initiatives / Continuity origin UX  
- Dropping `graph_*` / `thread_plans` Postgres tables (archived dumps exist; soak first)  
- Deep thread ↔ Tududi auto-linking / Research Pipeline UI inside AD  
