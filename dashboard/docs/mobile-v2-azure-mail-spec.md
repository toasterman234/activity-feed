# Mobile v2 Spec — Azure Mono + Mail Inbox + Sidebar Shell

## Goal
Build a new isolated `mobile-v2` surface inside `dashboard/` that:
- uses **Azure Mono** as the v2-only theme
- uses a **sidebar shell** for navigation
- uses a **mail-style Inbox** pattern for channel/thread triage
- reuses the existing dashboard APIs and links
- does **not** modify current production routes/screens

## Non-goals
- no replacement of `/`, `/channels`, `/projects`, current `/mobile`, or OVH production UI
- no backend rewrites for this pass
- no deploy in this pass

## Route map
- `/mobile-v2` → Today
- `/mobile-v2/inbox` → Inbox
- `/mobile-v2/inbox/[channelId]` → Channel workspace
- `/mobile-v2/inbox/[channelId]/[threadId]` → Thread detail
- `/mobile-v2/projects` → Projects
- `/mobile-v2/projects/tududi/[projectUid]` → Tududi project detail
- `/mobile-v2/projects/tududi/[projectUid]/[taskUid]` → Tududi task detail
- `/mobile-v2/projects/[repoId]` → Repo detail
- `/mobile-v2/ops` → Ops
- `/mobile-v2/fleet` → Stub
- `/mobile-v2/registry` → Stub
- `/mobile-v2/runs` → Stub
- `/mobile-v2/config` → Stub

## Reused APIs / plumbing
- `/api/home/overview`
  - Today
  - Inbox detail supplements
  - Ops runtime/activity panels
- `/api/channels/activity?viewer=you`
  - Inbox channel list / queue
- `/api/repos`
  - Projects
- existing drill-in routes
  - `/channels/[channelId]`
  - `/channels/[channelId]/[threadId]`
  - `/projects/[repoId]`
- existing same-origin Next + Electric plumbing remains untouched

## Theme plan
- Add **scoped** Azure Mono CSS under `mobile-v2/_styles/azure-mono-v2.css`
- Apply tokens only inside `.mobile-v2-theme`
- Do not alter global `globals.css` tokens

## Shell plan
- Create `V2SidebarShell`
- Mobile: drawer/sidebar via sheet
- Desktop/tablet: persistent left sidebar
- Shared sections:
  - Today
  - Inbox
  - Projects
  - Ops
  - Stubbed follow-on pages for Fleet / Registry / Runs / Config

## Screen plan
### Today
- hero summary
- stat cards
- urgent queue
- active work
- unread channels
- quick links

### Inbox
- mail-inspired split view
- left: channel queue/list
- right: selected channel detail / thread queue / recent activity
- mobile: list-first then detail view

### Projects
- active repos first
- project metadata pills
- links to real project pages

### Ops
- runtime health
- recent activity
- recent thread highlights
- system links

## Affected files
### New
- `src/app/mobile-v2/layout.tsx`
- `src/app/mobile-v2/page.tsx`
- `src/app/mobile-v2/inbox/page.tsx`
- `src/app/mobile-v2/projects/page.tsx`
- `src/app/mobile-v2/ops/page.tsx`
- `src/app/mobile-v2/_styles/azure-mono-v2.css`
- `src/app/mobile-v2/_components/**`
- `src/app/mobile-v2/_hooks/**`

### Untouched by design
- current root layout and bottom nav behavior
- current production home/channels/projects screens
- current OVH route structure

## Risks
- Azure Mono token bleed if scope is wrong
- mail layout feeling too desktop-heavy on narrow widths
- Inbox detail richness is limited by current API shape

## Recommendation
Implement `mobile-v2` as a fully isolated frontend layer with a sidebar shell and mail-style inbox, while keeping all existing production routes as the operational backend + drill-in surface.

## Current status
- Today, Inbox, channel/thread drill-in, Projects, Tududi project/task drill-in, and Ops are real v2 pages.
- Fleet, Registry, Runs, and Config are present as navigation-complete stubs for now.
- See `docs/mobile-v2-status.md` for the current status and local Tailscale testing notes.
