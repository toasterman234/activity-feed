# Findings — Agent Handoff Batch 2026-08-01

## Codebase audit (2026-08-01)

### TududiPlanningTree
- Located at `src/app/projects/TududiPlanningTree.tsx`
- Uses `@headless-tree/core` and `@headless-tree/react` for tree rendering
- Custom Tree/TreeItem/TreeItemLabel components in `src/components/reui/tree.tsx`
- Done/Reopen button calls `onSetStatus(data.taskUid!, data.status === "done" ? "not_started" : "done")`
- `onSetStatus` bubbles up to `TududiPlanningPanel.setStatus()` which POSTs to `/api/tududi` with `action: "set_status"`
- API route at `src/app/api/tududi/route.ts` handles `set_status` via PATCH to Tududi
- Tree remounts on key change (`remountKey` based on selection + task status changes)

### Kanban component
- Located at `src/components/reui/kanban.tsx` — custom dnd-kit based implementation
- ChannelKanbanBoard at `src/app/channels/ChannelKanbanBoard.tsx`
- Wired in `[channelId]/page.tsx` via `buildKanbanCards()` and `ChannelKanbanBoard`
- Uses lifecycle transitions for validation
- Persists moves via `POST /api/channels/transition`

### Issues channel
- PLAN-issues-channel.md documents the full issues channel design
- issue lifecycle exists in `lifecycles.ts`
- ChannelKanbanBoard already supports any lifecycle via `lifecycleKey` prop
- Current `[channelId]/page.tsx` only renders Kanban when `viewMode === "kanban"`

### Home page
- HomeDashboard at `src/app/home/HomeDashboard.tsx`
- Already stripped of Continuity per PLAN-proto-promote-BUILD.md
- Shows Needs You / In Motion / Channels sections
- No Kanban view currently
