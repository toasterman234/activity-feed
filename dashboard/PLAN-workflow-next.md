# PLAN — Workflow console next (index for pi / Ben)

**Status:** active sequencing doc  
**Date:** 2026-07-29  
**Workdir:** `/Users/bencharney/activity-feed/dashboard`

## Where we are

| Track | Spec | Status |
|---|---|---|
| Console shell (cockpit, StageActionBar, live runs, branding) | `PLAN-workflow-console-BUILD.md` | ✅ shipped + deployed (`20260729T162950Z-39b82835ebc3-34232`) |
| Residual QA fixes | `PLAN-workflow-console-FIX.md` | ✅ committed locally (`a098d2e`…`1887a94`) — **deploy to OVH if not yet live** |
| Continuous stage loop | `PLAN-workflow-stage-loop-BUILD.md` | ⬜ next product work |
| Agent runtime health | `PLAN-agent-runtime-health-BUILD.md` | ⬜ parallel / after stage-loop Phase 0 if blocked on runs |
| IA diet + quieter ops chrome | `PLAN-workflow-ia-diet-BUILD.md` | ⬜ after loop feels usable |

## Recommended agent order

```
0. Confirm FIX is on OVH (deploy if needed). Smoke the notifications coding thread.
1. PLAN-workflow-stage-loop-BUILD.md   ← primary UX continuity
2. PLAN-agent-runtime-health-BUILD.md ← so Advance/Run actually executes
3. PLAN-workflow-ia-diet-BUILD.md     ← reduce nav noise once core loop works
```

If Ben prioritizes “agents actually run” over stage UX polish, swap 1↔2.

## What “done” for the whole program means

An operator can:

1. Open Home → pick Needs you / In motion  
2. Land on a thread with cockpit + one Stage Action Bar  
3. Complete the **current stage workspace** without chat as control plane  
4. Advance → next stage workspace takes over automatically (collapsed prior stage)  
5. See live runs when agents work; know when runtime is down **and** how to recover  
6. Not wade through Finance/Personal as primary nav while doing workflow ops  

## Non-goals (still deferred)

- Full Finance redesign  
- Merging advance+transition into one HTTP API (UI already unified)  
- Deleting deprecated GuideBar files  
- Replacing Electric / shape budget  
