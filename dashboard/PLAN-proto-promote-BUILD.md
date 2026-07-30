# BUILD SPEC — Promote proto skins onto real pages

**Status:** ready to implement  
**Audience:** pi agent  
**Workdir:** `/Users/bencharney/activity-feed/dashboard`  
**Branch:** `theme-prototype`  
**Depends on:**
- `PLAN-proto-ia-align-BUILD.md` ✅
- `PLAN-proto-wire-data-BUILD.md` ✅ (proto-4/5/10 live — Electric shapes for channels/messages; polls for thread-meta/extras per ADR-003)
**Index:** `PLAN-workflow-next.md`
**Tududi:** [activity-dashboard-pwa](http://100.101.106.60:3002/project/w3yg7n93tat3t6p) · stage `promote`
**Out of scope:** new Electric shapes · deep Tududi↔thread linking · OVH deploy · Continuity/graph UI resurrection · tsup/dist fix for `@electric-circuits/*` (deferred task only)

---

## Goal

Replace the real pages' UX with the proto-tested IA and visual skins, **preserving** the existing stage engine (StageActionBar + DoNowBanner + lifecycle transitions) on the thread page. The protos become the reference — we promote their layout/component patterns onto the real routes and then delete the sandbox.

**What changes:**

| Real page | Source | What happens |
|-----------|--------|--------------|
| `/` (Home) | Proto-4 IA | Replace `/home` content. Strip ContinuitySnapshot, Ready to Execute, Continuity promote panels. Keep Needs You / In Motion / Channels only. |
| `/channels` (channel list) | Real page stays mostly | Already IA-aligned; bottom-nav add Projects is the main change |
| `/channels/[channelId]` (thread list) | Proto-5 visual skin | Adopt proto-5 card/density/styling patterns. Already wired via Electric. |
| `/channels/[channelId]/[threadId]` (thread cockpit) | Proto-10 SHELL only | **Skin the UI chrome** (tabs, header, cards, stage pills) — keep StageActionBar + DoNowBanner + all lifecycle logic intact. Proto-10 is ~644 lines of a visual/density spec, not a drop-in replacement for the ~1058-line cockpit. |
| `/projects` | Existing `TududiPlanningPanel` | Already exists. Bottom-nav reaches it. No UI change this BUILD. |
| Bottom-nav | IA lock | 4 tabs: Home / Channels / Projects / Ops |
| Proto sandbox | Delete proto-1/2/3/6/7/8/9 | Keep proto-4/5/10 during promote for reference; delete after verify. |
| Middleware | Disable proto-only redirect | Allow `/`, `/channels`, `/projects`, `/ops` through on design host. |

---

## Settled decisions

| Topic | Choice |
|---|---|
| Thread cockpit | **Do not replace** the ~1058-line `[channelId]/[threadId]/page.tsx`. Apply proto-10's **visual skin** (tabs, header, stage pills, card patterns, status chips, accent rows) as targeted CSS/component swaps. Keep StageActionBar, DoNowBanner, lifecycle transitions, and all write paths. |
| HomeDashboard rewrite scope | Replace `HomeDashboard.tsx` with proto-4's IA (Needs You / In Motion / Channels). Delete `ReadyToExecutePanel`, `useContinuitySnapshot`, `StatusStrip`, `ContinuitySnapshot` type. Keep `useHomeOverview` data path. |
| Channels list (`/channels`) | Visual refresh only — adopt proto-5 density and card patterns. Data path unchanged (Electric + poll). |
| Channel thread list (`/channels/[channelId]`) | Same — visual refresh from proto-5 patterns. Data path unchanged. |
| Nav | Replace `BottomNav` 3-tab with 4-tab (Home / Channels / Projects / Ops). Use real Next.js `<Link>` — no proto sandbox hrefs. |
| Middleware | Disable proto-only redirect on `theme-prototype` branch. This is a design branch, not OVH production. Do NOT deploy with disabled middleware — call out the risk explicitly. |
| Continuity / graph | Strip all Continuity fields from HomeDashboard. Do not touch Continuity in `useThreadExtras` API payload — the thread page already doesn't render it; proto-10 already ignores `graph*` fields. |
| Proto deletion | Delete proto-1/2/3/6/7/8/9 dirs + remove from `ProtoNav` component. Keep proto-4/5/10 until verify, then delete as final cleanup. |
| Electric shape budget | No change. Channels + members + messages = 3 live shapes max per page. Thread extras stay polled. Do not wire new shapes. |
| tsup/dist fix | Deferred Tududi task only — do not implement in this BUILD. |
| Commit | Only if Ben asks. |

---

## ⚠️ CRITICAL GOTCHAS

1. **Middleware disable = routes escape sandbox.** On `theme-prototype`, disabling the proto-only middleware means `/`, `/channels`, `/projects`, `/ops` will render real pages. This is fine for a design branch but must NEVER be deployed to OVH without a separate deploy gate. Add a big comment in middleware and mention it in the rollback section.

2. **HomeDashboard is a complex page (~800+ lines with Continuity).** Stripping Continuity means removing: `useContinuitySnapshot` (lines 209-256), `ContinuitySnapshot` type (171-207), `StatusStrip` (which reads continuity counts), `ReadyToExecutePanel` (452-504), Continuity rows from `NeedsAttentionPanel` and `InMotionPanel`. This is NOT a small edit — it affects ~300 lines across multiple components in one file.

3. **Thread cockpit — do NOT replace wholesale.** The real thread page has StageActionBar (state transitions, run dispatch, promote), DoNowBanner (blocking gates), events/steps write-back, and complex lifecycle UI. Proto-10 is a visual skin with proper shadcn components, tab layout, and stage pills. The promote is: apply proto-10's visual patterns *selectively* — tabs, header, card wrappers, status chips — leaving the stage engine untouched.

4. **Bottom-nav is currently used by the real app layout.** Changing it to 4 tabs with `/projects` will make the Projects tab functional immediately (TududiPlanningPanel already exists at `/projects`). Verify `/projects` route works before promoting the nav change.

5. **`useThreadExtras` returns Continuity fields** (ADR-003 API payload includes graph continuity — leftover from graph era). Proto-10 already ignores them. Real thread page already doesn't render them. Do not add new Continuity UI anywhere. Do not strip the API fields — that's a backend cleanup deferred to after soak.

6. **Shape budget must be respected.** The thread page already holds 3 live shapes. Do not add a 4th for thread extras — keep the poll pattern from ADR-003. Ditto channels page.

7. **No OVH deploy.** `npm run deploy:ovh` must not be run in this BUILD. The middleware change alone makes this unsafe for production without explicit review.

8. **Proto-4 has live useHomeOverview already.** Promoting proto-4 onto HomeDashboard means the data path is proven. The risk is in the UI rewrite, not the data layer.

9. **Commit only if Ben asks.** Stage explicitly with `git add <paths>`. No `git add .`.

---

## PHASE 0 — Audit (read-only)

1. Confirm real HomeDashboard renders on design host (may need to temporarily disable middleware to check — or just read the code).  
2. Confirm `/projects` route works — visit `http://10.0.1.200:8450/projects` (if middleware allows) or read `src/app/projects/page.tsx`.  
3. Confirm real thread page loads for a known thread — verify StageActionBar + DoNowBanner are mounted in the DOM.  
4. Skim `PLAN-proto-wire-data-BUILD.md` for the Electric wiring patterns already proven in proto-4/5/10.  
5. Note current proto-4/5/10 pages as reference during implementation (do not delete them yet).

**Commit:** none.

---

## PHASE 1 — Real bottom-nav: Home / Channels / Projects / Ops

**File:** `src/app/bottom-nav.tsx`

1. Add `{ href: "/projects", label: "Projects" }` to `TABS` between Channels and Ops.  
2. Keep existing styling, active detection, prefetch=false.  
3. Ensure `/projects` pathname matching works (`pathname === "/projects" || pathname.startsWith("/projects/")`).

**Verify:** Nav shows 4 tabs on mobile. Tapping Projects navigates to `/projects` (TududiPlanningPanel + repos).

**Rollback:** Revert to 3-tab array.

---

## PHASE 2 — Promote proto-4 IA onto HomeDashboard

**File:** `src/app/home/HomeDashboard.tsx` (major surgery — ~300 lines removed)

**What to strip (by section):**

| Remove | Lines (approx) | Why |
|--------|---------------|-----|
| `ContinuitySnapshot` type | 171-207 | Continuity retired |
| `useContinuitySnapshot()` | 209-256 | Continuity retired |
| Continuity counts in `StatusStrip` | 263-265 | Continuity retired |
| `ReadyToExecutePanel` component | 452-504 | IA lock: no Ready to Execute |
| `NeedsAttentionPanel` continuity merge | 356-406 | Continuity retired |
| `InMotionPanel` continuity init | 531 | Continuity retired |
| `StatusStrip` mounted at page level | 765 | Replace with proto-4 compact header |
| `ReadyToExecutePanel` mounted | 767 | IA lock |
| Continuity rows from attention/in-motion panels | scattered | Continuity retired |

**What to adopt from proto-4:**

| Adopt | From proto-4 | Notes |
|-------|-------------|-------|
| Compact header (Activity + counts) | lines ~135-146 | Replace StatusStrip |
| Needs You section (amber accent, DividedRow pattern) | lines ~150-212 | Keep but use real `data.topNeedsMe` + `data.needsAttention.failedPromotions` already in HomeDashboard |
| In Motion section (muted, DividedRow) | lines ~214-258 | Keep but use real `data.topActive` already in HomeDashboard |
| Channels grid (2-col, unread badges) | lines ~259-280 | Keep but use real `data.topPulse` already in HomeDashboard |
| `AccentRow`, `DividedList`, `DividedRow` shadcn components | proto-4 imports | Already available via `@/components/ui` |

**Do NOT touch:**
- `useHomeOverview()` hook — data path unchanged
- `data.channels` pulse data — already wired
- `data.summaryCounts` — used in compact header

**Verify:** `/` loads Home with 3 sections: Needs You, In Motion, Channels. No Ready to Execute. No Continuity copy. No StatusStrip with Continuity counts.

**Rollback:** `git checkout src/app/home/HomeDashboard.tsx`.

---

## PHASE 3 — Promote proto-5 visual skin onto channels surfaces

**Files:**
- `src/app/channels/page.tsx` — all-channels list
- `src/app/channels/[channelId]/page.tsx` — per-channel thread list
- (Optionally extract shared card/list components if they don't already exist in `@/components/ui`)

**What to adopt from proto-5:**

| Adopt | Notes |
|-------|-------|
| Thread row density / spacing | Proto-5 uses tighter padding, status chips inline with title |
| Card wrapping (shadcn `Card` / `CardContent`) | If real pages use raw divs, wrap in shadcn cards |
| Status chips from `StatusChip` component | Already in `@/components/ui` — ensure consistent |
| Channel header pattern | `# channelName` compact header from proto-5 |
| Unread badge placement | Proto-5 style (if different from current real pages) |
| Dividers / accent rows | `DividedList` / `DividedRow` / `AccentRow` from proto-4/5 patterns |

**Do NOT touch:**
- Electric shape acquire/release (ADR-001)
- `useChannelRows`, `useChannelThreadMeta`, `useMessageRows` data paths
- Channel activity poll
- Compose bar / create-thread functionality

**This is a CSS/component swap, not a data rewrite.** The real pages already have the right data — adopt proto-5's visual patterns on top.

**Verify:** `/channels` and `/channels/[channelId]` look consistent with proto-5 visual spec. Status chips, density, card borders match proto-5.

**Rollback:** `git checkout src/app/channels/page.tsx src/app/channels/[channelId]/page.tsx`.

---

## PHASE 4 — Promote proto-10 SHELL onto real thread page (KEEP stage engine)

**File:** `src/app/channels/[channelId]/[threadId]/page.tsx` (~1058 lines — targeted visual swaps, NOT a rewrite)

**What to adopt from proto-10 (visual only):**

| Adopt | Notes |
|-------|-------|
| Tab bar (Work / Conversation / Overview / Artifacts) | Proto-10 uses shadcn-style tab buttons with bottom-border active state. Replace current tab implementation if different. |
| Compact header (thread title, channel, author, StatusChip) | Proto-10 lines ~294-314. Replace current header. |
| Stage pills (drafting → execution → verifying → shipped) | Proto-10 lines ~343-362. If real page doesn't have a stage-strip visual, add this. |
| Do-now banner styling | Proto-10 lines ~331-342 (amber banner). Adopt the shadcn style onto real `DoNowBanner`. |
| Card wrappers for content sections | Proto-10 uses `Card` / `CardContent` / `DividedList` / `DividedRow` consistently. |
| Agent trace section | Proto-10 lines ~416+ (monospace trace in bg-muted card). If real page doesn't have this, add from `extras.activity`. |
| Artifacts tab | Proto-10 from `extras.artifacts`. Add if real page doesn't have it. |

**What to KEEP from real page (do NOT remove):**

| Keep | Why |
|------|-----|
| `StageActionBar` | State transitions, run dispatch, promote. Core execution engine. |
| `DoNowBanner` | Blocking gates. Keep functional; only restyle to match proto-10 visual. |
| All lifecycle/transition logic | `advanceState`, run dispatch, promote pipeline. |
| Write paths (compose, reply, post artifact) | Functional chat/write. |
| Electric shape acquire/release | Already correct. |
| `useThreadExtras` poll | Data path unchanged. |

**Tactical approach:**

1. Wrap existing content sections in proto-10's shadcn `Card` + `CardContent` pattern.  
2. Replace the header with proto-10's compact layout (title, channel, author, StatusChip).  
3. Add stage pills row above tabs (derive from `extras.workflowEvents` — proto-10's `deriveStages` function).  
4. Replace tab bar with proto-10's shadcn tab buttons.  
5. Restyle `DoNowBanner` to proto-10's amber banner pattern (keep internal logic).  
6. Add Agent Trace card from `extras.activity` if missing.  
7. Add Artifacts tab from `extras.artifacts` if missing.  
8. Keep `StageActionBar` at the bottom exactly where it is.  
9. Keep all state transition, run, and promote logic untouched.

**DO NOT:**
- Replace the entire page.tsx with proto-10's page.tsx (~644 lines)
- Remove StageActionBar or DoNowBanner
- Change the data paths (Electric shapes, polls)
- Add Continuity/graph* UI
- Add Tududi task lists

**Verify:** Real thread page loads with proto-10 visual skin. StageActionBar works. DoNowBanner renders with new styling. Tabs switch content. Stage pills show correct lifecycle.

**Rollback:** `git checkout src/app/channels/[channelId]/[threadId]/page.tsx`.

---

## PHASE 5 — Remove unused protos + disable proto-only middleware

### 5a — Delete unused proto dirs

**Dirs to delete:**
- `src/app/proto-1/` — Dashboard Grid (unused)
- `src/app/proto-2/` — Timeline Feed (unused)
- `src/app/proto-3/` — Kanban Board (unused)
- `src/app/proto-6/` — Ch Cards (unused)
- `src/app/proto-7/` — Ch Activity (unused)
- `src/app/proto-8/` — Th Split (unused)
- `src/app/proto-9/` — Th Timeline (unused)

**Keep (reference during promote, delete after verify):**
- `src/app/proto-4/`
- `src/app/proto-5/`
- `src/app/proto-10/`

### 5b — Update ProtoNav

**File:** `src/app/proto/proto-nav.tsx`

Remove proto-1/2/3/6/7/8/9 from `PROTOS` array. Keep 4/5/10.

### 5c — Disable proto-only middleware

**File:** `src/middleware.ts`

Replace the proto-only redirect with a pass-through that allows all app routes on `theme-prototype`:

```ts
// ⚠️ DESIGN BRANCH ONLY — proto sandbox middleware disabled.
// Real routes (/, /channels, /projects, /ops) work on this host.
// MUST re-enable proto-only gating before OVH deploy.
export function middleware(request: NextRequest) {
  // Allow everything through on design branch
  return NextResponse.next();
}
```

**CRITICAL:** Add a visible comment block that this must be reverted before OVH deploy.

**Verify:** `http://10.0.1.200:8450/` renders HomeDashboard (promoted). `/channels`, `/projects`, `/ops` all work.

**Rollback:** `git checkout src/middleware.ts` + restore proto dirs.

---

## PHASE 6 — Verify checklist + doc sync

### Verify

- [ ] `/` renders Needs You / In Motion / Channels — no Continuity, no Ready to Execute
- [ ] Bottom-nav shows 4 tabs: Home / Channels / Projects / Ops
- [ ] `/projects` loads TududiPlanningPanel + repos
- [ ] `/channels` has proto-5 visual patterns
- [ ] `/channels/[channelId]` has proto-5 visual patterns
- [ ] `/channels/[channelId]/[threadId]` has proto-10 visual shell with StageActionBar + DoNowBanner intact
- [ ] StageActionBar advance/run/promote still works
- [ ] Electric shapes still work (no new shapes added)
- [ ] No Continuity/graph UI anywhere
- [ ] Proto-4/5/10 still reachable at `/proto-4`, etc. (reference)

### Doc sync

- [ ] `PLAN-workflow-next.md` updated: wire-data ✅, next = this BUILD (promote)
- [ ] `PLAN-proto-promote-BUILD.md` status updated as phases complete

### Tududi

- [ ] Move promote stage to in-progress/complete
- [ ] Add deferred task: "electric-circuits client+protocol tsup/dist for Turbopack" (if not already present)
- [ ] Do NOT implement the tsup/dist task

---

## Final cleanup (after Ben verifies promote)

When Ben confirms the promote looks correct:

1. Delete proto-4/5/10 dirs
2. Remove proto-4/5/10 from ProtoNav `PROTOS` array
3. Delete `src/app/proto/` dir entirely (or keep ProtoNav for future proto cycles)
4. Remove proto-only middleware entirely (or keep a comment-only stub)

---

## Done when (this BUILD)

- [ ] Phase 1: Real bottom-nav 4 tabs
- [ ] Phase 2: HomeDashboard stripped — no Continuity / Ready to Execute
- [ ] Phase 3: Channels surfaces have proto-5 visual skin
- [ ] Phase 4: Thread page has proto-10 visual shell + keeps StageActionBar/DoNowBanner
- [ ] Phase 5: Unused protos deleted; middleware disabled (design branch only)
- [ ] Phase 6: Verify checklist green; doc sync done
- [ ] No OVH deploy
- [ ] Commit only if Ben asks
- [ ] Chat report: what changed, how to verify, rollback command for each phase

---

## Explicitly deferred

- OVH deploy (separate decision + middleware re-enable required)
- tsup/dist fix for `@electric-circuits/client` + `protocol` (Turbopack hang) — Tududi deferred task only
- Stripping Continuity fields from `useThreadExtras` API payload (backend cleanup)
- Dropping `graph_*` / `thread_plans` Postgres tables (archived dumps exist; soak first)
- Deep Tududi ↔ thread linking
- Full Finance / visual theme redesign
- Re-binding evidence initiatives / Continuity origin UX
