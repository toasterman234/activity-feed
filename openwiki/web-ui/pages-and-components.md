---
type: Web UI
title: Pages and Components
description: Current routes, data sources, and UI responsibilities for the OVH activity dashboard.
tags: [web-ui, routes, activity-dashboard, electric-circuits]
---

# Pages and Components

The dashboard is a Next.js 16 App Router PWA. It is designed for phone use first: the home page is a compact control panel, and the other tabs hold the deeper lists and workflows.

## Page Routes

| Route | Purpose | Primary Data Source |
|---|---|---|
| `/` | **Home** — compact overview with unread, needs-me, active work, hot threads, and agent/system status | `GET /api/home/overview` |
| `/activity` | **Activity** — raw feed plus projects / memory / collections detail | electric-circuits + `GET /api/activity-log-cutoff` |
| `/channels` | **Channels** — channel list with unread + lifecycle rollups | electric-circuits + `GET /api/channels/activity` |
| `/channels/[channelId]` | **Channel detail** — channel members and thread list | electric-circuits + `GET /api/channels/thread-meta` |
| `/channels/[channelId]/[threadId]` | **Thread detail** — lifecycle, plans, workflow steps, promotion state, replies | electric-circuits + `GET /api/channels/thread-extras` |
| `/projects` | **Projects** — promoted/registered repos and work entry points | `GET /api/repos`, `POST /api/projects/work` |
| `/projects/[repoId]` | **Project detail** — repo-specific thread/work views | project APIs |
| `/finance` | **Finance** — portfolio, banking, watchlist, trades, screener, personal views | electric-circuits + Market Lake |
| `/fleet` | **Fleet** — registry, agent profiles, runs entry | registry + fleet APIs |
| `/workflows` | **Workflows** — versioned workflow template registry (also via Settings) | workflow APIs |
| `/models` | **Models** — proxy/model status, swaps, subscriptions (Settings tab) | model APIs |
| `/settings/perf` | **Perf** — web vitals and app measures | perf APIs |

## Home page contract

The home page is not another feed. It is a **one-screen control panel**.

It should answer, at a glance:

1. What needs me?
2. What is active?
3. What is broken?
4. Where do I tap next?

The home page uses compact ranked slices from `GET /api/home/overview`:

- `summaryCounts`
- `topUnread`
- `topNeedsMe`
- `topActive`
- `topThreads`
- `topPulse`

The UI shows counts first and only a few top rows per section. Deep detail stays behind `/activity`, `/channels`, and `/models`.

## Main data patterns

### 1. Live shapes for deep views

Use electric-circuits shapes for pages where the user is actively browsing detailed state:

- activity feed
- channels
- thread message streams
- finance datasets

These views justify live updates and can tolerate richer UI.

### 2. Aggregated APIs for summary views

Use server-side aggregation for pages that need a compact summary, especially Home.

Why:

- lower connection pressure
- less repeated client work
- faster phone-friendly first render
- easier ranking/prioritization on the server

Home is the main example: it reads a single overview payload instead of opening several live shapes just to summarize them.

### 3. Polling for secondary thread detail

Thread plans, workflow steps, artifacts, and promotion rows are secondary detail. They are polled instead of kept as extra live shapes so thread pages stay inside the shape budget.

## Navigation

Bottom nav is the primary mobile entry point:

- **Home**
- **Activity**
- **Channels**
- **Fleet**
- **Finance**
- **Settings**

Settings secondary tabs: Performance · Models · Workflows.

Rule of thumb:

- Home = summary / routing
- Activity = raw stream
- Channels = thread workspace
- Fleet = registry / agent fleet hub (Registry lives here)
- Finance = portfolio / watchlist / screener / trades
- Settings = perf, models, workflow registry editor

## PWA behavior

The app is installed as a standalone PWA from the OVH Tailscale URL.

If the phone still shows an older shell after deploy:

1. open the production URL in the browser, not the installed icon
2. hard refresh once
3. if still stale, remove/re-add the installed PWA

The service worker may keep an older shell until the client reloads.

## Visual editing

`react-rewrite` can edit the local dev server visually. Use it for spacing, typography, density, and ordering changes, then deploy the confirmed changes to OVH.

## Performance guidance

Two rules matter most for this app:

1. **Do not burn the live-shape budget on summary views.** Summary pages should aggregate server-side.
2. **Keep mobile surfaces dense and shallow.** Large stacked cards quickly turn into scroll-heavy pages on phone screens.
