# BUILD — Visual density + theme unify (post–promote polish)

**Date:** 2026-07-29 (CT)  
**For:** pi / Cursor implementer  
**Branch:** `theme-prototype` (dirty working tree — many uncommitted promote changes)  
**App root:** `/Users/bencharney/activity-feed/dashboard`  
**Live:** `https://bens-mac-mini.taila1553c.ts.net:8450/` (Tailscale → `:3010`; always `curl` before asking Ben)  
**Dev:** `next dev --webpack -p 3010 -H 127.0.0.1` (Turbopack cannot load `@electric-circuits/*` raw `.ts`)

**Prior context:** `HANDOFF-proto-promote-20260729.md`  
**Index:** update `PLAN-workflow-next.md` when this BUILD starts/finishes.

---

## One-line goal

Promote made the **component vocabulary** real; this BUILD makes the **product surfaces feel bold, scannable, and consistent** — denser Home (hybrid channels), design-language Channels with waiting signals, hybrid Thread (proto-10 chrome + StageActionBar), simplified theme-aligned Projects.

---

## Why this exists (Ben critique 2026-07-29)

Visual promote of proto-4/5/10 is **code-complete but not signed off**. Ben’s live review:

| Surface | Verdict |
|---------|---------|
| **Home** | Too sparse. Not busy — but In Motion needs more info; Channels must show recent threads/replies (not a name grid). |
| **Channels** | Does not feel like the chosen design. Index should be bolder + make thread count and **new / waiting** obvious. Detail should match proto-5 compactness; tuck Members admin away. |
| **Threads** | Does not look like proto-10. Keep **hybrid**: StageActionBar stays; chrome/density toward proto-10. |
| **Projects** | Literally old zinc theme vs Home tokens. Theme-align **and simplify** cards. |

**Do not** claim “promote done” or delete proto-4/5/10 until Ben eyeballs this polish pass.

---

## Locked product IA (unchanged)

| Layer | Owns |
|-------|------|
| **Tududi** | Shared planning |
| **AD PWA** | Execution: channels → threads → lifecycles → stage cockpit → agent runs |
| **iii** | Coding agents + Tududi console tab |

- Bottom nav: **Home / Channels / Projects / Ops**
- Home sections: **Needs You / In Motion / Channels only** (no Ready to Execute / Continuity)
- Thread Work = execution/stage steps (not Tududi todos)
- Graph Continuity / ActiveGraph / project-world: **retired** — do not resurrect

---

## Locked design decisions (Ben)

### Home

1. **Density:** less sparse, not busy. Same 3 sections. Caps: ~5–8 In Motion, ~4–6 Channels.
2. **In Motion rows:** show useful progress, not just state + title.
   - Keep StatusChip + title
   - Meta line: `#channel · assignee? · latest step OR last reply · relative time`
   - Optional whisper only when useful: promotion / reply count
3. **Channels section = option C (hybrid):**
   - Per-channel **header** (name + unread/active counts)
   - Under each: **one nested recent thread** (title + reply signal + last author/time)
   - Tap channel header → `/channels/[id]`; tap nested thread → thread URL
4. **Fix:** `DividedList` empty-state bug (see Phase 0) — “Nothing active.” currently shows above real rows.

### Channels index (`/channels`)

1. Adopt **design language** (PageShell / DividedList / StatusChip / tokens) — bolder, not busy.
2. Easy to see **how many threads** exist per channel.
3. **More important:** which threads are **new** or have a **message waiting** (unread / wait) — visual priority over mute open counts.
4. Keep create-channel / Flows affordances; restyle into the language (don’t invent a new IA).

### Channel detail (`/channels/[channelId]`)

1. Align closer to **proto-5**: compact `#name` header, DividedList thread rows + StatusChip, compose bar.
2. **Tuck Members admin away** — not a permanent top card. Prefer collapse/disclosure (“Members”) or overflow/settings entry. Mentions/`@agent` options can still resolve members without the admin UI always visible.

### Thread (`/channels/[id]/[threadId]`)

1. **Hybrid (explicit):**
   - **Keep** `StageActionBar` + `DoNowBanner` + lifecycle write paths
   - **Move toward proto-10 chrome:** compact header, stage pills, tab bar density, Card/DividedList language in Work/Conversation/Overview/Artifacts
2. Do **not** wholesale replace the cockpit with proto-10 mocks.
3. Goal: first viewport should feel like proto-10 shell with the real stage engine inside — not “old zinc workflow card with a few chips glued on.”

### Projects (`/projects`)

1. **Theme-align:** replace hardcoded `zinc-*` / emerald one-offs with `PageShell` + design tokens (`bg-background`, `border-border`, `StatusChip` / `Badge` / `Card`) matching Home.
2. **Simplify cards:** cut action/pill clutter.
   - Keep primary path obvious (open project / work)
   - Demote secondary actions (source thread, remote, new thread) — overflow menu, single secondary, or detail page only
   - Fewer status pills: prioritize **active** + hard signals (missing on host); don’t stack AIWG/archived/promoted as equal noise
3. Restyle `TududiPlanningPanel` into the same token language (still a thin planning window).

### Ops

**Out of scope** unless Ben asks. Still zinc; do not expand this BUILD into a full Ops restyle.

---

## Reference protos (keep until Ben OK)

| Proto | URL | Role |
|-------|-----|------|
| proto-4 | `/proto-4` | Home list language (baseline — Home will get denser than this) |
| proto-5 | `/proto-5` | Channel **detail** compact thread list |
| proto-10 | `/proto-10` | Thread chrome / tabs / cards |

QA screenshots (promote baseline): `tmp-qa/promote-20260731/`  
Smoke ids: channel `1ddfb1c5-bb2a-4abd-b4e1-ab7c644faa1e` (`test-channel`), thread `f0fe319d-e85d-4e3c-bd75-83952024a12c` (`test`).

---

## Data already available (prefer reuse)

### Home — `GET /api/home/overview` via `useHomeOverview`

| Field | Use |
|-------|-----|
| `topNeedsMe` | Needs You (unchanged IA) |
| `topActive` | In Motion — has `latestStep`, `promotion` (often null today) |
| `topThreads` / `threadActivity` | Enrich In Motion when step missing; feed Home Channels hybrid |
| `topPulse` | Channel-level unread + `lastPulse` + state rollups |

**Home Channels (C) join strategy:**
1. Take top channels from `topPulse` (or derive from `topThreads` by recency).
2. For each channel, pick **one** best recent thread from `topThreads` / `threadActivity` (`lastMessageAt` / `updatedAt`).
3. Show `title`, `replyCount`, `lastAuthor`, `lastMessageAt`, optional `state`.

Avoid new Electric shapes. Home stays REST overview.

### Channels index — `GET /api/channels/activity?viewer=you`

Today per channel:

```ts
{ channelId, unreadCount, states: { start, active, wait, proven }, lastPulse }
```

**Gaps for Ben’s “thread count + which threads waiting”:**

| Need | Today | Action |
|------|-------|--------|
| Thread count | Not on activity payload | Extend activity (or cheap count from `thread_meta` group by channel) → `threadCount` |
| Unread / waiting emphasis | Channel-level `unreadCount` + `states.wait` | Bold unread row; promote **wait** chip; de-emphasize open/proven clutter |
| **Which threads** waiting | **Missing** | Extend activity with `waitingPreview: Array<{ threadId, title, reason: 'unread'\|'wait', updatedAt }>` (cap 1–2 per channel) **or** nest one preview row in the DividedList UI using a small parallel poll. Prefer one API extension so the list stays one source of truth. |

Do not invent fake unread. Use existing read-state / `thread_meta` wait semantics consistent with home overview.

### Channel detail

Already has Electric messages + `useChannelThreadMeta` — thread rows can show reply counts / last author (already partially there). Focus is layout + tuck Members.

### Thread

Keep existing extras polls (`useThreadExtras`). Visual only + layout hierarchy.

### Projects

Existing `/api/projects` (or whatever `page.tsx` fetches) — no data rewrite; UI only.

---

## File map (primary)

| Area | Files |
|------|--------|
| DividedList bug | `src/components/ui/ListRow.tsx` |
| Home | `src/app/home/HomeDashboard.tsx`, `src/app/home/useHomeOverview.ts` (types only if needed) |
| Home API (only if enriching) | `src/app/api/home/overview/route.ts` |
| Channels index | `src/app/channels/page.tsx`, `src/app/channels/ChannelsContent.tsx` |
| Channels activity API | `src/app/api/channels/activity/route.ts` |
| Channel detail | `src/app/channels/[channelId]/page.tsx` |
| Thread | `src/app/channels/[channelId]/[threadId]/page.tsx`, `WorkflowCockpit.tsx`, `ThreadTabs.tsx`, `ThreadWorkTab.tsx`, StageActionBar / DoNowBanner (restyle only) |
| Projects | `src/app/projects/page.tsx`, `TududiPlanningPanel.tsx`, `ProjectWorkButton.tsx` |
| Tokens/components | `src/components/ui/*` (`PageShell`, `Card`, `StatusChip`, `DividedList`, `Badge`) |

---

## Phased build order

### Phase 0 — Shared bugfix (do first)

**File:** `src/components/ui/ListRow.tsx` — `DividedList`

**Bug:** `empty` prop always renders a `<li>` when provided, **even if children exist**. Home In Motion shows “Nothing active.” above RUNNING rows. Channel detail has the same footgun.

**Fix:** render `empty` only when there are no children (e.g. `Children.count(children) === 0`, or accept `isEmpty` boolean). Preserve empty styling.

**Verify:** Home with active items — no “Nothing active.”; empty In Motion still shows empty copy.

---

### Phase 1 — Home density (option C)

**File:** `HomeDashboard.tsx` (main)

1. **In Motion**
   - Enrich each `topActive` row with `threadActivity`/`topThreads` by `threadId` when `latestStep` is null.
   - Meta line: `#channel · assignee · step-or-last-reply · time`
   - Keep AccentRow / StatusChip language; slightly tighter padding OK if it improves scan.
   - Only pass `empty` when `active.length === 0` (after Phase 0, either approach works).

2. **Channels = hybrid C**
   - Replace 2-col name grid with a vertical list (DividedList or Card of channel groups).
   - Each group:
     - Header row: `#name` · unread badge · optional active/wait counts · chevron
     - Nested single thread: title · `N replies` · `lastAuthor · relativeTime` (or “No recent threads”)
   - Cap ~4–6 channels by recency / unread priority.
   - Links: header → channel; nested → thread.

3. **Needs You** — leave IA; only match density/spacing if trivial. Don’t invent content.

4. **Do not** add Continuity / Ready to Execute.

**Verify:** curl `:8450/` 200; mobile screenshot Home; In Motion meta populated when activity exists; Channels shows nested thread peeks; no empty-state ghost.

---

### Phase 2 — Channels index design language + waiting signals

**Files:** `ChannelsContent.tsx`, `page.tsx`, `api/channels/activity/route.ts`

1. Restyle list into DividedList / DividedRow (or equivalent Card+divided) + StatusChip/Badge — match Home/proto language.
2. Bolder hierarchy for **unread** and **wait** (font weight, accent, chip priority). Mute `open`/`proven` or collapse into a single secondary count.
3. Show **thread count** per channel (API extend).
4. Show **which threads** need attention: 1–2 preview lines (unread or wait) under the channel row — same spirit as Home C, but waiting-priority not merely “latest.”
5. Sort: unread/wait first, then recent pulse (already partially sorted).

**Verify:** `/channels` feels same family as Home; at a glance Ben can see thread volume + waiting threads; not a chip soup.

---

### Phase 3 — Channel detail → proto-5 + tuck Members

**File:** `src/app/channels/[channelId]/page.tsx`

1. Match proto-5 density: `#name` header, thread DividedList, compose bar as rounded card (proto-5 pattern).
2. Move Members admin behind disclosure / “Manage members” — default collapsed or off primary path.
3. Keep issue-lifecycle IssueList path working.
4. Ensure DividedList empty only when no threads (Phase 0).

**Verify:** side-by-side `/proto-5` vs `/channels/[test-channel]`; Members not dominating first viewport.

---

### Phase 4 — Thread hybrid toward proto-10

**Files:** thread `page.tsx`, tabs, WorkflowCockpit (careful)

1. Compact header + stage pills already partly there — tighten to proto-10 spacing/type.
2. Tab bar density/active state like proto-10.
3. Wrap sections in Card language consistently.
4. **Keep** StageActionBar + DoNowBanner functional; restyle so they feel native to the shell (not a foreign zinc block). Prefer integrating cockpit visually into Work tab hierarchy rather than deleting it.
5. No Continuity UI. No replacing write paths.

**Verify:** open test thread; stage transitions still work; first viewport reads as proto-10 family; StageActionBar still advances.

---

### Phase 5 — Projects theme-align + simplify

**Files:** `projects/page.tsx`, `TududiPlanningPanel.tsx`, `ProjectWorkButton.tsx`

1. `PageShell` + token backgrounds/borders; kill page-level `bg-zinc-*` sticky header pattern.
2. Simplify `ProjectCard`:
   - Primary: Open project + Work here (or one clear primary)
   - Secondary actions: menu or detail-only
   - Pills: active count + missing-on-host; demote AIWG/archived/promoted
3. Tududi panel: same tokens; keep thin planning window copy (“Tududi = shared planning…”).
4. Config banner can stay; restyle to token alert pattern (amber Card like Home alerts).

**Verify:** `/projects` matches Home theme; cards quieter; Tududi still readable when configured/unconfigured.

---

### Phase 6 — Browser QA + handoff

1. Screenshots: Home / Channels / channel detail / thread / Projects (desktop + mobile width). Suggest `tmp-qa/density-YYYYMMDD/`.
2. curl Tailscale URLs 200 for all touched routes.
3. Update `PLAN-workflow-next.md` status for this BUILD.
4. Leave protos in place until Ben signs off.
5. Write short `findings.md` addendum or new findings section for this pass.

---

## Acceptance criteria (Ben sign-off checklist)

- [ ] Home no longer feels empty; In Motion rows show useful meta
- [ ] Home Channels = hybrid C (channel + one nested recent thread)
- [ ] DividedList never shows empty copy when rows exist
- [ ] `/channels` uses design language; thread count visible; new/waiting threads obvious
- [ ] Channel detail ≈ proto-5; Members tucked away
- [ ] Thread ≈ proto-10 chrome; StageActionBar + DoNowBanner still work
- [ ] Projects matches Home theme; cards simplified
- [ ] No Continuity / Ready to Execute resurrection
- [ ] No OVH deploy; no proto deletion unless Ben asks

---

## Explicit non-goals

- OVH production deploy
- Deleting proto-4/5/10 (until Ben OK)
- Full Ops / Finance theme redesign
- Replacing StageActionBar with proto mocks
- New Electric shapes beyond budget (channels / members / messages)
- “Hard reload / PWA cache” as sole QA — use real route loads / Interceptor when verifying
- Tududi deep linking overhaul
- Fixing “Thread not found” for iii / To do Electric sync (known separate bug)

---

## URL gotchas

- Canonical phone URL: `https://bens-mac-mini.taila1553c.ts.net:8450/` only
- Dead: `:8450`→`:4010`, bare `:3090`, `100.71.118.10:3010`, LAN IPs
- Always curl Tailscale yourself before asking Ben to open a link

---

## Suggested pi kickoff message

> Read `PLAN-visual-density-BUILD.md` and `HANDOFF-proto-promote-20260729.md`. Implement Phases 0→5 in order. Do not deploy, do not delete protos. Verify on Tailscale `:8450` with screenshots under `tmp-qa/`. Stop after Phase 6 notes for Ben eyeball.

---

## Decision log (this session)

| # | Decision |
|---|----------|
| 1 | Home too sparse → denser In Motion + richer Channels |
| 2 | Home Channels = **C** (channel header + one nested recent thread) — not B flat topThreads-only |
| 3 | Channels index → design language; bold; thread count; prioritize new/waiting threads |
| 4 | Channel detail Members admin → tucked away |
| 5 | Thread → **hybrid** (keep StageActionBar; toward proto-10 chrome) |
| 6 | Projects → theme-align **and** simplify |
| 7 | Comprehensive BUILD for pi before implementation |
