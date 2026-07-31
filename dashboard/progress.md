# Progress Log: Home usable

## Session: 2026-07-29

### Completed
- Phase 0: Audit — read all 6 target files, documented findings
- Phase 1: Demoted unscoped issues from "Needs you" (`overview/route.ts`)
- Phase 2: Default owner + infer repo (new `issueMetaHeal.ts`, `attentionGuide.ts`, `page.tsx`)
- Phase 3: Quieter chrome (DoNowBanner, IssueHeader, Home copy)
- Deployed to OVH: `20260729T183116Z-c75c30cf7c46-56264`

### Files changed
- `src/app/api/home/overview/route.ts` — SQL CASE + WHERE + fallback copy
- `src/app/channels/attentionGuide.ts` — triage only for missing owner
- `src/app/channels/issueMetaHeal.ts` — NEW: heal helper
- `src/app/channels/[channelId]/[threadId]/page.tsx` — heal effect, DoNowBanner condition, forceEdit logic, IssueHeader
- `src/app/home/HomeDashboard.tsx` — Needs you description

### Test Results
- TypeScript: no new errors (3 pre-existing in page.tsx unrelated)
- Not deployed yet — QA pending on Ben's request

### Next Steps
- Run Phase 4 QA checklist on OVH
- Update `PLAN-workflow-next.md` status row

## Session: 2026-07-29 — mobile-v2 config

### Completed
- Replaced the `/mobile-v2/config` stub with a real mobile-v2 Config surface
- Added tabbed mobile-v2 wrappers for Models, Workflows, Notifications, and Perf
- Updated `docs/mobile-v2-status.md` to mark Config as a real page

### Files changed
- `src/app/mobile-v2/_components/ConfigView.tsx` — NEW real config surface
- `src/app/mobile-v2/config/page.tsx` — swapped stub for ConfigView
- `docs/mobile-v2-status.md` — config no longer listed as a stub

### Test Results
- `npm run build` passed

### Next Steps
- Optional: deploy to OVH if Ben wants it live on phone
