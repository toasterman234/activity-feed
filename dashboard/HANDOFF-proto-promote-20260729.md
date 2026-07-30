# Handoff — Activity Dashboard redesign (post–visual promote)

**Date:** 2026-07-29 (evening CT) / promote claimed 2026-07-31 in docs  
**For:** Fresh Cursor session with Ben  
**Mode:** Ben will critique what he doesn’t like and brainstorm next; do **not** start big implementation until he directs.

---

## One-line state

Visual promote of proto-4/5/10 onto real routes is **code-complete on `theme-prototype`**. Ben has **not** fully signed off; next session is **feedback / polish / brainstorm**, then cleanup/deploy as he chooses.

---

## Product split (locked)

| Layer | Owns |
|-------|------|
| **Tududi** | Shared planning (projects/tasks/decisions) |
| **Activity Dashboard (AD) PWA** | Execution: channels → threads → lifecycles → stage cockpit → agent runs |
| **iii** | Coding agents + Tududi console tab |

Graph Continuity / ActiveGraph / project-world: **retired** (soft-off + archive). Do not resurrect Continuity UI or “Ready to promote” graph flows.

**IA lock:**
- Bottom nav: **Home / Channels / Projects / Ops**
- Home sections: **Needs You / In Motion / Channels only** (no Ready to Execute / Continuity)
- Thread Work: **execution/stage steps** (not Tududi todos)
- Projects tab: thin Tududi window (`TududiPlanningPanel`) + repo/execution list

---

## Where to look

| What | Path / URL |
|------|------------|
| App root | `/Users/bencharney/activity-feed/dashboard` |
| Branch | `theme-prototype` (dirty working tree — many uncommitted changes) |
| Index | `PLAN-workflow-next.md` |
| Specs | `PLAN-proto-ui.md`, `PLAN-proto-ia-align-BUILD.md`, `PLAN-proto-wire-data-BUILD.md`, `PLAN-proto-promote-BUILD.md` |
| Tududi project | [activity-dashboard-pwa](http://100.101.106.60:3002/project/w3yg7n93tat3t6p) (`w3yg7n93tat3t6p`) |
| **Phone / browser URL** | **https://bens-mac-mini.taila1553c.ts.net:8450/** |
| Dev | `next dev --webpack -p 3010 -H 127.0.0.1` (Tailscale `:8450` → `:3010`) |
| QA screenshots | `tmp-qa/promote-20260731/` (01–10 home/channels/thread/projects/ops + mobile) |
| Proto reference (keep until Ben OK) | `/proto-4`, `/proto-5`, `/proto-10` |

### URL gotchas (do not regress)

- **Canonical:** `https://bens-mac-mini.taila1553c.ts.net:8450/` only for Ben’s phone.
- Dead/wrong: `:8450`→`:4010` (old), bare `:3090`, `100.71.118.10:3010`, `192.168.*`, `10.0.1.200:8450`.
- Always `curl` the Tailscale URL yourself before asking Ben to open a link.
- Turbopack cannot load `@electric-circuits/*` raw `.ts` exports → **must use `--webpack`**.

---

## What shipped (this arc)

1. **Align** — ProtoShellNav; drop Ready to Execute from proto-4; Execution steps language on proto-10.  
2. **Wire** — Proto-5/10 on Electric shapes (channels/messages) + polls (`useChannelThreadMeta` / `useThreadExtras`) per ADR-001/003.  
3. **Promote (visual)** — Real routes use proto component system:
   - `/` → `PageShell` / `DividedList` / `StatusChip`, 3 sections (`HomeDashboard.tsx`)
   - `/channels` + `/channels/[id]` → proto-5 density/chips
   - Thread → cards/tokens + stage pills; **`StageActionBar` + `DoNowBanner` kept**
   - Unused protos 1/2/3/6/7/8/9 deleted; middleware **open on design host only**
4. **Browser QA** — Screenshots under `tmp-qa/promote-20260731/`; routes curl 200.

**Graph teardown** (prior session): Tududi live; Continuity soft-hide; PW archived. AD = execution PWA.

---

## Ben’s last verdict / intent

- Earlier: `/` looked like the **old** app — that was before the final visual promote pass; latest screenshots show redesign language on `/`.
- **Now:** He wants a **fresh session** to say what he doesn’t like and brainstorm — not another blind “mark promote done” loop.
- Treat visual promote as **pending Ben eyeball**, even if agent checklist is ✅.

---

## Still open (ordered)

### Immediate (this next session)
1. **Ben visual critique** of live `/`, Channels, Thread, Projects, Ops (and optional `/proto-*` side-by-side).  
2. Capture likes / dislikes / polish list → decide what to change vs defer.

### Bookkeeping (cheap)
3. **Tududi sync** — project still shows Wire DOING + promote children OPEN; should mark wire/promote done once Ben accepts.  
4. Refresh `PLAN-workflow-next.md` so it doesn’t claim “pending Phase 6” if Ben signed off.

### After sign-off
5. **Cleanup stage** — delete `proto-4/5/10`; document that design middleware must not ship to OVH as-is.  
6. **API cleanup** — strip dead Continuity / `approvedPlans` from home overview if still returned.  
7. **PLAN-home-usable** — Needs You quality check (not metadata theater).

### Known bugs / follow-ups (not promote scope)
8. Home links into **`iii` / “To do”** channels → **“Thread not found”** (rows in Postgres, Electric shape not synced). `test-channel` works.  
9. Proto-5/10 “Connecting…” without shape params — sandbox leftover; irrelevant once protos deleted.  
10. **Turbopack/tsup** for `@electric-circuits` client+protocol `dist/` (deferred).  
11. Deep Tududi ↔ thread linking; drop `graph_*` / `thread_plans` tables after soak.  
12. **OVH deploy** — only when Ben asks; confirm middleware + branch story first.

---

## Data / Electric notes

- Live shapes (budget): **channels / channel-members / messages** only.  
- Thread meta / steps / artifacts / workflow / activity: **REST poll** (`useThreadExtras`, `useChannelThreadMeta`) — ADR-003.  
- Circuits API typically `:8795`; Next proxies unmatched `/api` to circuits.  
- Home overview: REST `/api/home/overview`, not Electric.

Useful smoke ids (from wire verify):
- Channel: `1ddfb1c5-bb2a-4abd-b4e1-ab7c644faa1e` (`test-channel`)
- Thread: `f0fe319d-e85d-4e3c-bd75-83952024a12c` (`test`)

---

## How to start the fresh session

Suggested first user message:

> Read `activity-feed/dashboard/HANDOFF-proto-promote-20260729.md`. Don’t implement yet. I’ll tell you what I don’t like on the live redesign and what to brainstorm.

Agent should:
1. Read this handoff (+ skim `PLAN-workflow-next.md` if needed).  
2. Confirm `:8450` is up (curl).  
3. Wait for Ben’s critique; then Frame/Shape before coding.

---

## Prior chat context

Cursor transcript arc on this machine: assessment → IA lock → Tududi project → wire BUILD → Turbopack/webpack → promote → URL circle (8450→4010) → visual promote finish.  
Related earlier: graph teardown / Tududi cutover (`4450067f-…` and peers).

---

## Explicit non-goals unless Ben asks

- OVH production deploy  
- Full Finance theme redesign  
- Resurrecting Continuity / ActiveGraph  
- Replacing StageActionBar with proto mocks  
- “Hard reload / PWA cache” as the only QA strategy (use Interceptor when verifying)
