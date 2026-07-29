# Findings: Phone Push Notifications

Research, discoveries, and information gathered during this task.

## 2026-07-29 — Initial Recon

### Discovery: OVH coding thread state
Thread 246f0017-e8b1-4f21-b7b4-40a1bd99f96b:
- Lifecycle: `coding`, State: `running`
- Channel: 5f7b227d-2f32-4dc2-8685-3e42ff5bff76
- 12 real tasks (0-11) + 3 test/smoke tasks (12-14, done or test)
- Source plan: corrected reviewed plan (artifact 8fb7a3e7)
- Old Prisma plan also present as artifact b7542374 (rejected)

### Discovery: Architecture from corrected plan
- Next.js, PostgreSQL via `pg`, existing Serwist SW at `src/app/sw.ts`
- Web Push with VAPID keys (NOT Firebase/FCM)
- No social app concepts (users, posts, reactions, comments)
- Single-operator dashboard
- Authoritative event sources: workflow events, work runs, verification checks, approvals, deployments

### Discovery: FIX confirmed on OVH
- Service active (running) since 16:51 UTC
- Theme Lab 404s (removed per FIX)
- Thread page returns 200, state is running
- No "Blocked until" false label

### Discovery: Existing codebase structure
- `src/lib/` — utility modules (execFileNoStdin, iii-tasks, runAgentPrompt, etc.)
- `src/app/sw.ts` — Serwist service worker
- `src/app/api/` — API routes (channels/trigger, etc.)
- `ops/migrations/` — SQL migrations
- `src/app/shape-registry.ts` — Electric shape lifecycle management
- PostgreSQL tables use `text` columns, UUIDs as text IDs

---

## Key Takeaways
- Must use `pg` directly, not Prisma
- Must extend existing Serwist SW, not add firebase-messaging-sw.js
- Must follow shape budget (4 shapes/page max)
- Must use `execFileNoStdin` for any child processes
- Deploy via `npm run deploy:ovh` after each phase
