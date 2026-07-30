# Findings: Visual Promote (2026-07-31)

## Phase 0: Code Audit

### HomeDashboard — BEFORE promote
Old HomeDashboard used hand-rolled zinc components (HomeHeader, StatusStrip, CountPill, Card with inline title/action) spread over ~650 lines. Despite Continuity being stripped from types/hooks, the visual language was still old zinc — nothing like proto-4.

### Channels pages — BEFORE promote
- `/channels` page.tsx had old zinc header, no PageShell
- ChannelsContent used direct zinc classes (`bg-zinc-50`, `border-zinc-200`, etc.)
- `/channels/[channelId]/page.tsx` used old zinc styling everywhere

### Thread page — BEFORE promote
Header + stage pills already proto-10 style. But body content (archived banner, lifecycle suggestion, promote dialog, IssueHeader) all used old zinc classes.

## Phase 2: HomeDashboard → proto-4 (COMPLETE)
- Rewrote entire file (~270 lines vs old ~650) using proto-4 patterns
- Uses PageShell, StatusChip, Badge, Card/CardContent, DividedList/DividedRow
- 3 sections: Needs You (amber), In Motion (muted), Channels
- No Continuity, no ReadyToExecute, no StatusStrip
- Data path unchanged (useHomeOverview)

## Phase 3: Channel pages → proto-5 (COMPLETE)
- `/channels` wraps in PageShell with proto-5 header
- ChannelsContent uses StatusChip + Badge + cx tokens
- Channel detail fully rewritten with DividedList/DividedRow patterns
- StatusChips for state tones, accent rows per thread
- All write paths preserved (compose, postMessage, addMember, createIssue)
- Data paths unchanged (Electric shapes + polls)

## Phase 4: Thread page body → proto-10 (COMPLETE)
- Converted body sections from elemental zinc to design tokens (bg-background, border-border, text-muted-foreground)
- Imported Card, CardContent, StatusChip, cx, UiTone from @/components/ui
- Replaced inline `statusBadge()` with `stateTone()` + StatusChip component
- Archived banner, lifecycle suggestion, promote dialog, IssueHeader all wrapped in Card
- StageActionBar + DoNowBanner + all lifecycle paths INTACT
- Stage pills already proto-10 style (no change needed)

## Phase 5: Cleanup
- Proto-1/2/3/6/7/8/9 already deleted
- ProtoNav already updated to 4/5/10 only
- Middleware already disabled

## Browser QA Results
- All 7 routes return 200
- Bottom-nav shows 4 tabs: Home, Channels, Projects, Ops
- Home: Activity heading, In Motion, Channels — no Continuity/ReadyToExecute
- StageActionBar present on thread page
- Tab bar: Work, Conversation, Overview, Artifacts, History visible
- No new TS errors introduced

## Residual Gaps
- DividedList renders empty row alongside items (pre-existing component bug)
- "Needs You" section only renders when non-empty (correct per proto-4)
- Some pre-existing TS errors in proto-10, research page, run-eval route (not our changes)

---

# Findings: Visual Density + Theme Unify (2026-07-31)

## Phase 0: DividedList empty-state bug (FIXED)
- `ListRow.tsx` — `empty` prop rendered unconditionally even when children existed.
- Fix: `Children.count(children) > 0` guard before rendering empty `<li>`.
- Home In Motion and channel detail both protected.

## Phase 1: Home density + hybrid Channels C
- In Motion rows now show `#channel · assignee · step/reply · time` via `threadActivityById` lookup map.
- Channels section: replaced 2-col name grid with DividedList of channel groups.
  - Each group: bold channel header (name + unread badge + wait count + chevron).
  - One nested recent thread (title + reply count + last author + time) linked to thread URL.
  - Header links to channel detail; nested preview links to thread.
- Rules of Hooks bug: initial edit placed `useMemo` after early returns. Fixed by hoisting both memos above all conditional returns.

## Phase 2: Channels index design language + waiting signals
- API extended (`/api/channels/activity`): added `threadCount` and `waitingPreview[]` (up to 2 per channel) via new SQL queries.
- `ChannelsContent.tsx`: restyled from loose link list to `DividedList` inside `Card`.
- Channel rows bolder when unread/waiting; `waitingPreview` shows inline thread previews with StatusChip.
- Sort: unread/wait-first, then by last pulse recency.

## Phase 3: Channel detail → proto-5 + tuck Members
- Members admin card moved behind `<details>` disclosure, default collapsed.
- Add member inputs preserved inside the disclosure panel.
- Thread list unchanged (already used DividedList/StatusChip pre-BUILD).

## Phase 4: Thread hybrid toward proto-10
- `ThreadTabs.tsx`: restyled from `bg-zinc-900` active to `bg-primary` design tokens.
- `ThreadConversationTab.tsx`: message cards, reply list, compose bar restyled to `bg-card`/`border-border`.
- Thread page zinc classes (`bg-zinc-50`, `text-zinc-400`) replaced with `bg-background`/`text-muted-foreground`.
- StageActionBar + DoNowBanner untouched (functional hybrid per spec).

## Phase 5: Projects theme-align + simplify
- `projects/page.tsx`: full rewrite from `zinc-*` classes to `PageShell` + `Card`/`Badge`/`StatusChip`.
- Cards simplified: "Open" primary, "Work here"/"New thread" secondary, Source/Remote demoted.
- Pills reduced: active count + missing-on-host + AIWG (conditionally) + promoted (conditionally). No archived/AIWG-negative noise.
- `TududiPlanningPanel.tsx`: restyled to `Card`/design tokens; kept thin planning window copy.
- `ProjectWorkButton.tsx`: default style changed from `emerald-600` to `bg-primary`.

## Verification
- All 3 project checks pass (routes ✓, shell ✓, shapes ✓).
- All 5 routes return 200 on Tailscale `:8450`.
- No protos deleted. No OVH deploy.
