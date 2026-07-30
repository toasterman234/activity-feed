# BUILD SPEC — Wire protos to live execution data (Electric + poll)

**Status:** ready to implement  
**Audience:** pi agent  
**Workdir:** `/Users/bencharney/activity-feed/dashboard`  
**Branch:** `theme-prototype` (proto sandbox)  
**Depends on:** `PLAN-proto-ia-align-BUILD.md` ✅ · `PLAN-proto-ui.md` IA lock · Electric Circuits (see below)  
**Index:** `PLAN-workflow-next.md`  
**Tududi:** [activity-dashboard-pwa](http://100.101.106.60:3002/project/w3yg7n93tat3t6p) · stage `wire-data`  
**Out of scope:** promote to real pages · middleware swap · OVH deploy · Tududi UI in protos · Continuity/graph surfaces · new Electric shapes

---

## Goal

Replace mock data on chosen protos with the **same hybrid data path the real app uses**:

| Surface | Live source | Mechanism |
|---------|-------------|-----------|
| Channels / messages / members | **Electric Circuits** shapes | `@electric-circuits/client` long-poll shapes via `src/app/electric.ts` + `shape-registry` |
| Thread meta / plans / steps / artifacts / workflow / activity | **REST poll** | `useChannelThreadMeta` / `useThreadExtras` (ADR-003 — do **not** add shapes) |
| Home overview | **REST poll** | `useHomeOverview()` → `/api/home/overview` (not Electric) |

Preserve IA lock: Home = Needs You / In Motion / Channels; Thread Work = execution steps; no Ready to Execute / Continuity.

---

## Electric Circuits confirmation (verified 2026-07-29)

**Yes — this dashboard uses Electric Circuits**, not raw `@electric-sql/react` alone.

Evidence:

- `package.json` deps: `@electric-circuits/{api,client,protocol}` (`file:../electric-circuits/…`) + `@electric-sql/client` + TanStack DB from the circuits workspace
- Vendored tree: `activity-feed/electric-circuits/`
- Browser client: `src/app/electric.ts` → `createClient({ apiUrl: origin+/api, dsBaseUrl: origin+/ds, liveMode: "long-poll", schema })`
- Shape defs: `CHANNELS_SHAPE`, `CHANNEL_MEMBERS_SHAPE`, `MESSAGES_SHAPE`, … (also finance/agent shapes unused by this BUILD)
- Hooks: `src/app/channels/shapes.ts` — `getChannelShape` / `getMessageShape` / `getMemberShape` + `useChannelRows` / `useMessageRows` / `useMemberRows` via `useLiveQuery`
- Proxy: `next.config.ts` fallback rewrites `/api/*` → `127.0.0.1:8795` (circuits tRPC) when no Next route matches; `/ds` via App route for durable streams
- Lifecycle ADRs: **ADR-001** (refcount close), **ADR-003** (≤ shape budget per page; thread extras polled)

### What is Electric vs poll on the real pages (copy this pattern)

**Channels list** (`ChannelsContent`):  
Electric `channels` shape + poll `/api/channels/activity`.

**Channel detail** (`/channels/[channelId]`):  
Electric `channels` + `messages` + `members` + poll `useChannelThreadMeta(channelId)`.

**Thread** (`/channels/[id]/[threadId]`):  
Electric same 3 shapes + poll `useThreadExtras(threadId)` for plans/steps/artifacts/meta/workflowEvents/activity. Comments in code: keep within `SHAPE_BUDGET`.

**Home** (`useHomeOverview`):  
Not Electric — aggregated SQL/API snapshot.

### Shape budget rule (do not violate)

A page may hold **at most the shared 3 live shapes**: channels / channel-members / messages.  
**Never** open live shapes for `thread_plans`, workflow steps, artifacts, or `thread_workflow_events` — poll only (ADR-003 / ADR-007).

`useThreadExtras` still returns graph Continuity fields from the API — **ignore them in protos**; do not render Continuity / graph-inbox UI.

---

## Settled decisions

| Topic | Choice |
|---|---|
| Proto-5 meaning | **Per-channel thread list** (header `# channelName`), matching `/channels/[channelId]` — not the all-channels index |
| Proto-5 data | Electric messages (+ channels for name) + `useChannelThreadMeta(channelId)` for state chips; activity/unread from meta/messages as available |
| Proto-5 channel pick | Query `?channelId=` else first Electric channel (prefer one named `activity-feed` if present) |
| Proto-10 data | Electric messages filtered to thread + `useThreadExtras` for meta/steps/artifacts/activity; Execution steps ← `extras.steps` (workflow steps), not Tududi / not `thread_plans` as planning todos |
| Proto-10 reply | Optional: post via existing write path used by real thread page **only if** copy-paste is straightforward; else read-only conversation is OK this BUILD |
| Proto-4 | Already `useHomeOverview`; remove dead `approvedPlans` binding; no Continuity |
| Continuity mock in proto-5 | Delete mock thread titled around “continuity graph inbox” when swapping to live data |
| Nav | Keep `ProtoShellNav`; Projects/Ops stay `#` + live hint under middleware |

---

## ⚠️ CRITICAL GOTCHAS

1. **Proto middleware** still redirects non-`/proto-*` pages. API + Electric proxy must keep working (`matcher` excludes `api`). Do not “fix” by whitelisting real pages unless Ben asks.
2. **Electric Circuits must be up** on the design host (`:8795` + ds). If shapes hang on “Connecting…”, check circuits API / ds — don’t invent a REST-only parallel for messages.
3. **Acquire/release pairing** — copy the `useEffect` pattern from the real thread page: `getChannelShape` + `getMessageShape` (+ members if needed) → `release*` on unmount. Never leak shapes (ADR-001).
4. **Do not add Electric shapes** for thread extras. Use `useThreadExtras` / `useChannelThreadMeta` polls.
5. **IA lock:** no Ready to Execute, no Continuity panels, no Tududi checklist on Work tab. Execution steps = `WorkflowStepRow` / stage work.
6. Proto-10 links from proto-5 must pass **real** `channelId` + `threadId` (path or query) so wiring can load the right thread — stop using title-only query mocks once live.
7. `thread_plans` in extras ≠ Tududi tasks. Prefer **workflow steps** for “Execution steps”. If steps empty, show empty state — don’t fall back to plans-as-todos.
8. No OVH deploy. Commit only if Ben asks.
9. Prefers reading real page code (`ChannelsContent`, `[channelId]/page.tsx`, `[threadId]/page.tsx`, `shapes.ts`, `electric.ts`) over reinventing.

---

## PHASE 0 — Audit (read-only)

1. Confirm circuits process reachable: hit a known Next route that uses shapes OR check `:8795` on host.  
2. Skim ADR-001 / ADR-003 one-pagers if unclear.  
3. Skim real channel + thread pages for acquire/release + hook usage.  
4. Note one live `channelId` / `threadId` pair for manual verify.

**Commit:** none.

---

## PHASE 1 — Proto-4 polish (Home)

**File:** `src/app/proto-4/page.tsx`

1. Remove unused `const plans = data?.approvedPlans || []` (and any leftover).  
2. Confirm only Needs You / In Motion / Channels sections render.  
3. Keep `useHomeOverview` (REST — not Electric).

**Verify:** `/proto-4` loads overview; no Ready to Execute; no Continuity copy.

---

## PHASE 2 — Proto-5 wire (channel thread list)

**File:** `src/app/proto-5/page.tsx` (+ tiny helpers OK)

1. Acquire Electric **channels** + **messages** shapes (members optional). Release on unmount.  
2. Resolve `channelId` from query or default.  
3. `useChannelRows` → channel title (`# name`).  
4. `useChannelThreadMeta(channelId)` → state / assignee for chips.  
5. Derive thread rows from root messages (same idea as real channel page) joined with meta.  
6. Link each row → `/proto-10?channelId=…&threadId=…` (keep title/state as optional display fallback).  
7. Unread badges: best-effort from activity poll **or** omit if costly — do not add a 4th live shape.  
8. Compose bar: can stay visual-only this BUILD (or wire create if trivial).

**Verify:** `/proto-5` shows live threads for a real channel; opening a row reaches proto-10 with ids.

---

## PHASE 3 — Proto-10 wire (thread stacked)

**File:** `src/app/proto-10/page.tsx`

1. Read `channelId` + `threadId` from query (required for live mode).  
2. Acquire same 3 shapes pattern as real thread page; `useMessageRows` filtered to thread; `useThreadExtras(threadId)`.  
3. Header: title from root message / meta; `StatusChip` from `extras.meta.state`.  
4. Conversation tab: live messages (read-only OK).  
5. Work tab **Execution steps:** map `extras.steps` (`step_label`, `status`). Empty → muted “No execution steps”.  
6. Optional: activity / artifacts from extras in Overview/Artifacts tabs if already sketched.  
7. **Do not** render Continuity / graph* fields. **Do not** mount `StageActionBar` (real page only).  
8. Sticky reply: optional wire; if skip, leave disabled with note.

**Verify:** `/proto-10?channelId=…&threadId=…` shows live conversation + meta; Execution steps reflect polled workflow steps.

---

## PHASE 4 — Doc + Tududi sync

1. Point `PLAN-workflow-next.md` step 2 at this file as in-progress/done.  
2. Mark Tududi tasks done when verified:  
   - `Write PLAN-proto-wire-data-BUILD.md for pi` (this file)  
   - child wire tasks as each phase completes  
3. Do not invent new shape budget ADRs.

---

## Done when

- [ ] Proto-4: no `approvedPlans` residue; 3 Home sections only  
- [ ] Proto-5: live Electric + `useChannelThreadMeta` (no mock thread list)  
- [ ] Proto-10: live messages (Electric) + `useThreadExtras` poll; Execution steps from workflow steps  
- [ ] Shape acquire/release correct; **no new Electric shapes**  
- [ ] No Continuity / Ready to Execute / Tududi checklist clone  
- [ ] ProtoShellNav still present  
- [ ] Chat note: how to view + which `channelId`/`threadId` was used  

---

## Explicitly deferred

- Promote skins onto real `/`, `/channels`, thread pages (`StageActionBar` keep)  
- Real bottom-nav 4 tabs  
- Middleware off / unused proto deletion  
- Strip Continuity from `useThreadExtras` API payload  
- OVH deploy  
