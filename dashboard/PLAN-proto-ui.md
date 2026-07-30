# Proto UI — Checkpoint 2026-07-29 (Update: shadcn rewrite)

## What changed since last checkpoint

Rewrote the three chosen prototypes (4, 5, 10) from raw inline styles to shadcn/Tailwind
using the real dashboard component system. All three unified under the same theme.
Protos 1, 2, 3, 6, 7, 8, 9 are still inline-style originals — untouched.

## Access

**Tailscale URL:** `https://bens-mac-mini.taila1553c.ts.net:8450`  
**Dev server:** `:8450 → 127.0.0.1:4010` (Next.js 16 Turbopack)  
**Start command:** `cd dashboard && npx next dev -p 4010 -H 127.0.0.1`  
**Restart:** `pkill -9 -f "next dev"; cd dashboard && rm -rf .next && npx next dev -p 4010 -H 127.0.0.1 &`

## Prototype pages (current state)

| # | Route | Page | Status | Data |
|---|-------|------|--------|------|
| 1 | `/proto-1` | Home — Dashboard Grid | Original (inline) | `useHomeOverview()` |
| 2 | `/proto-2` | Home — Timeline Feed | Original (inline) | `useHomeOverview()` |
| 3 | `/proto-3` | Home — Kanban Board | Original (inline) | `useHomeOverview()` |
| 4 | `/proto-4` | Home — Minimal List | **✅ Rewritten (shadcn)** | `useHomeOverview()` — **wired** |
| 5 | `/proto-5` | Channels — Compact List | **✅ Rewritten (shadcn)** | Mock data |
| 6 | `/proto-6` | Channels — Card Grid | Original (inline) | Mock data |
| 7 | `/proto-7` | Channels — Activity Feed | Original (inline) | Mock data |
| 8 | `/proto-8` | Thread — Split Panel | Original (inline) | Mock data (interactive) |
| 9 | `/proto-9` | Thread — Timeline | Original (inline) | Mock data |
| 10 | `/proto-10` | Thread — Stacked Mobile | **✅ Rewritten (shadcn)** | Mock data (interactive) |

### Cross-linking (updated)

```
Proto 4 (Home) ── "All channels" ──→ /channels (blocked by middleware)
Proto 5 (Channels) ── tap thread ──→ Proto 10 (Thread)
Proto 10 (Thread) ── "←Back" ──→ Proto 5
```

## Chosen prototypes (for promotion to real pages)

| View | Proto | Why |
|------|-------|-----|
| Home | 4 — Minimal List | Dense, scannable, accent borders on each row, sections for Needs You / In Motion / Channels / Ready |
| Channels | 5 — Compact List | Single card with divided rows, StatusChip per thread, unread badges |
| Thread | 10 — Stacked Mobile | Full-width stacked layout, tasks/trace/advance as cards, sticky reply bar |

## Component system in use

All shadcn-compatible via `@base-ui/react` + `cva` + Tailwind v4:

- **Shared components** (live in `dashboard/src/components/ui/`):
  - `PageShell` — page wrapper with safe-area inset
  - `Card` / `CardContent` / `CardHeader` — content cards
  - `StatusChip` — colored state badge (11px, rounded, border, shadow)
  - `Badge` — inline label
  - `DividedList` / `DividedRow` — list with dividers, accent left-border via `UiTone`
  - `ListStack` / `ListRow` — standalone rows
  - `cx` — classname joiner
- **UiTone keys:** `wait` | `active` | `open` | `proven` | `neutral` | `danger` | `good` | `primary`
- **Theme:** CSS variables (`--bg`, `--fg`, `--surface`, `--accent`, `--border`, etc.) → Tailwind `@theme inline`

### State → UiTone mapping (used in proto-4, 5, 10)

| Thread state | UiTone | Color |
|---|---|---|
| in_progress, running | `active` | sky blue |
| review | `wait` | amber (pulse) |
| blocked, failed | `danger` | red |
| resolved, shipped, verified | `good` | emerald |
| drafted, triaged, inbox | `open` | violet |
| approved | `primary` | accent |

## Data layer (already live, not yet wired to proto-5/10)

| Hook | What it provides | Used by |
|------|-----------------|---------|
| `useHomeOverview()` | KPI counts, needsMe, active, channels, plans, agents | Proto-4 ✅ |
| `useChannelRows()` | Live channel list via Electric shape | Real `/channels` page |
| `useChannelThreadMeta()` | Polls thread metadata per channel | Real `/channels/[id]` page |
| `useThreadExtras()` | Polls plans, steps, artifacts, meta, promotion, activity events | Real thread page |
| `useMessageRows()` | Live messages via Electric shape | Real thread page |
| Tududi `/api/tududi` | Projects, tasks, templates (planning layer) | `/projects` page |

## Files modified this checkpoint

```
dashboard/src/components/ui/index.ts          — Fixed barrel: added CardContent/CardHeader/Badge, removed stale ButtonLink
dashboard/src/app/proto-4/page.tsx             — Full rewrite (inline → shadcn)
dashboard/src/app/proto-5/page.tsx             — Full rewrite (inline → shadcn)
dashboard/src/app/proto-10/page.tsx            — Full rewrite (inline → shadcn)
```

## Gotchas

- Barrel export in `index.ts` had a stale `ButtonLink` that didn't exist. Fixed.
- `Card` file is lowercase `card.tsx` — must import as `./card` not `./Card`.
- Proto-5/10 links point to proto routes, not real routes (middleware blocks all non-proto).
- Server dies after some time (memory?). Restart with the command above.
- Tailscale mapping: `tailscale serve --https=8450 --bg 127.0.0.1:4010`

## Post-teardown IA lock (2026-07-29)

Graph Continuity / ActiveGraph soft-off is done. Tududi owns shared planning. AD stays the execution PWA. Before promoting protos, this IA is locked:

| Surface | Decision |
|---------|----------|
| **Bottom nav** | **Home / Channels / Projects / Ops** — four primary tabs |
| **Projects tab** | Thin Tududi window (`TududiPlanningPanel` + link out) + existing repo/execution list underneath |
| **Home sections** | **Needs You + In Motion + Channels only** — drop Ready to Execute / Continuity promote from Home |
| **Thread Work checklists** | **Execution / stage steps only** — planning todos live in Tududi, not AD thread mock "tasks" |
| **Product split** | Tududi = what to plan/decide; AD = channels → threads → lifecycles → stage cockpit → runs |

### Gaps this lock closes vs current protos

- Proto-4 still renders **Ready to Execute** from `approvedPlans` / `thread_plans` — remove that section before promotion.
- Proto-10 Work tab mock checklists read like planning todos — relabel/wire as stage/execution steps only.
- Bottom nav today is Home / Channels / Ops — Projects (Tududi) is orphaned; add **Projects** as a fourth primary tab (Ops stays).
- `PLAN-home-continuity-context-BUILD.md` cancelled — do not implement Continuity origin UX.
- `PLAN-workflow-next.md` updated to this sequencing.

## Next steps (when ready)

1. **Align protos to IA lock** — see `PLAN-proto-ia-align-BUILD.md` (drop Ready to Execute; clarify proto-10 Work; Projects in bottom nav)
2. **Wire real data to proto-5** — swap mock threads for `useChannelThreadMeta()` + activity poll
3. **Wire real data to proto-10** — `useThreadExtras()` + `useMessageRows()`; stage/work steps only (no Tududi checklist clone)
4. **Polish proto-4** — Needs You / In Motion / Channels only against `useHomeOverview()`
5. **Remove unused protos** (1, 2, 3, 6, 7, 8, 9) — keep proto-nav as a design reference
6. **Promote to real pages** — bottom nav Home / Channels / Projects / Ops
7. **Swap middleware** — remove the proto-only redirect so real pages are accessible again
8. **Deploy to OVH** — `cd dashboard && npm run deploy:ovh`

## Rollback

All changes are in proto pages only. To revert:
```
git checkout dashboard/src/app/proto-4/page.tsx
git checkout dashboard/src/app/proto-5/page.tsx
git checkout dashboard/src/app/proto-10/page.tsx
git checkout dashboard/src/components/ui/index.ts
```
