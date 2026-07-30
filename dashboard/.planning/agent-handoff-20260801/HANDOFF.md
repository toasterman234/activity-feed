# Handoff — Activity Dashboard PWA (ui-kit leftovers batch)

**Date:** 2026-08-01
**For:** Next agent picking up where this session left off
**Branch:** `theme-prototype` (dirty working tree)
**Repo:** `/Users/bencharney/activity-feed/dashboard`

---

## What shipped this session

1. **Tree Done/Reopen hardened** — `TududiPlanningPanel.tsx` + `TududiPlanningTree.tsx`
   - Added `setErr(null)` before each operation (errors clear on success)
   - Guarded against double-submission (`if (busy) return` in `addTask`)
   - Added `[external_id:ad:pwa:ui-kit:task:<ts>]` marker on new tasks for idempotency
   - `e.preventDefault()` on Done/Reopen button to prevent tree nav on click

2. **Issue-channel Kanban board** — `[channelId]/page.tsx`
   - Added List/Board toggle to `IssueList` component (same pattern as `ThreadList`)
   - Wired `ChannelKanbanBoard` with `lifecycleKey="issue"` + `buildKanbanCards`
   - DnD transitions persist via existing `/api/channels/transition`

3. **Home Kanban board** — `HomeDashboard.tsx` + new `HomeKanbanBoard.tsx`
   - Added List/Board toggle on Home page
   - `HomeKanbanBoard` uses same `@components/reui/kanban.tsx` components
   - Columns: Incoming / Active / Waiting / Done / Dead
   - Cards derived from `topThreads` + `threadActivity` from `useHomeOverview`
   - **View-only** — drag disabled (aggregated across channels; use per-channel boards for DnD)

4. **Tree DnD persist** — `TududiPlanningTree.tsx` + `api/tududi/route.ts`
   - Wired `dragAndDropFeature` from `@headless-tree/core`
   - Tasks are draggable, groups (Open/Done) accept drops
   - `onDrop` persists task order via `set_order` → PATCH to Tududi with `order` field
   - New API action: `POST /api/tududi { action: "set_order", uid, order }`

---

## Files changed

| File | What |
|------|------|
| `src/app/projects/TududiPlanningPanel.tsx` | Error clearing + idempotent external_id + onReorderTask wiring |
| `src/app/projects/TududiPlanningTree.tsx` | DnD feature + canDrag/canDrop/onDrop config + button guard |
| `src/app/channels/[channelId]/page.tsx` | IssueList Kanban toggle + board integration |
| `src/app/home/HomeDashboard.tsx` | View toggle + kanbanCards memo + conditional board/list |
| `src/app/home/HomeKanbanBoard.tsx` | **NEW** — view-only aggregated Kanban |
| `src/app/api/tududi/route.ts` | New `set_order` action |

---

## Still open (from Tududi project `w3yg7n93tat3t6p`)

### Deferred (not this batch)
- shadcn Tasks example / todo10 / tweakcn inline theme editor
- Drop `graph_*` / `thread_plans` tables
- Deep Tududi ↔ thread auto-linking
- Strip dead Continuity + approvedPlans from Home/API

### Promote-related (sibling arc, separate from ui-kit)
- Promote proto-4/5/10 visual to real pages (IA lock per `PLAN-proto-ui.md`)
- Real bottom-nav → 4 tabs
- Post-promote cleanup (delete protos, middleware)

### Pending verification
- `Smoke Tududi tree Done/Reopen on live /projects` — API tested, needs browser verify
- `Verify PLAN-home-usable on live` — deferred from prior batch
- `Stage: Wire protos to live execution data` — sibling arc

---

## How to verify

1. **Tree Done/Reopen:** open `/projects` → expand Tududi tree → click Done on a task → confirm it moves to Done group → click Reopen → confirm it returns. No console errors.
2. **Issue-channel Kanban:** open an issue channel → toggle Board → drag a card between columns → confirm transition persists on refresh.
3. **Home Kanban:** open `/` → toggle Board → confirm cards appear in correct columns → cards link to threads.
4. **Tree DnD:** open `/projects` → drag a task within/into a group → the order should persist (PATCH to `/api/tududi` sets `order`).

## Dev server

```bash
cd dashboard && npm run dev -- --webpack -p 3010 -H 127.0.0.1
```

Turbopack can't load `@electric-circuits/*` raw `.ts` exports — must use `--webpack`.

## Next agent prompt

> Resume from `dashboard/.planning/agent-handoff-20260801/` — pick up verification and any remaining ui-kit items.
