---
type: Architecture
title: Live Sync Connection Budget
description: Why Electric shape streams are budgeted per page, how the shape registry enforces it, and when to poll instead of stream.
tags: [architecture, electric, performance, http, shapes]
---

# Live Sync Connection Budget

## The constraint

Every live Electric shape (`client.shape(...)`) holds a **long-poll HTTP
connection** to `/ds/shape/...` for as long as it is open. Phone/Tailscale
access uses plain HTTP, so the browser caps the app at roughly **6 concurrent
connections per origin** (HTTP/1.1). Next.js also needs sockets from that same
pool for route transitions, RSC fetches, and API writes.

When live shapes consume the whole pool, navigation blocks: the app freezes
and the dev-only Next.js pill sticks on **"Rendering"**. This has caused two
production-feel incidents (2026-07-25, twice in one day):

1. **Leaked streams** — shapes cached at module scope, never closed. Fixed by
   the refcounted shape registry
   ([ADR-001](../../dashboard/docs/decisions/ADR-001-shape-stream-lifecycle.md)).
2. **Over-budget page** — the thread page opened 6 live shapes at once
   (3 shared channel shapes + plans/steps/artifacts). Correct lifecycle,
   but zero connection headroom; hitting back from a thread stalled for
   seconds. Fixed by the budget + polling below
   ([ADR-003](../../dashboard/docs/decisions/ADR-003-shape-connection-budget.md)).

## The rules

| Rule | Enforced by |
| --- | --- |
| All live shapes go through `acquireShape` / `releaseShape` (`dashboard/src/app/shape-registry.ts`) | build gate + code review |
| Max **4** live shapes per page (`SHAPE_BUDGET`) | dev-mode throw in `acquireShape`; build gate |
| No bare `client.shape(` outside an `acquireShape` factory | `dashboard/scripts/check-shape-budget.mjs`, wired into `npm run build` (`npm run check:shapes`) |
| Secondary data polls `client.query()` instead of streaming | convention — see `useThreadExtras` |

## Stream vs poll — how to choose

- **Live shape** (budgeted): primary collections the page is *about* —
  messages, channels, the activity feed. Sub-second updates matter.
- **`client.query()` polling**: secondary/per-detail data — thread plans,
  workflow steps, artifacts. One-shot, server-side filtered, holds no
  connection. `useThreadExtras(threadId)` in
  `dashboard/src/app/channels/shapes.ts` polls every 3s while the tab is
  visible and refreshes immediately after local writes.

Adding a live shape to a page is a **capacity decision, not just a data
decision**. If a page needs more data, filter or combine shapes, or poll —
never raise the budget.

## Symptom → diagnosis cheat sheet

If the app lags on Channels or after visiting Activity, and the dev pill
sticks on "Rendering":

1. Count established browser connections: `lsof -iTCP:3000 -sTCP:ESTABLISHED`.
2. Check the console for Electric's "~6 concurrent connections" HTTP/1.1
   warning.
3. Run `npm run check:shapes` in `dashboard/`.
4. Do **not** reach for bundler swaps, list virtualization, or `prefetch`
   toggles first — they don't free sockets (see ADR-001's table of prior
   misdiagnoses).

## Transport: HTTPS / HTTP/2 (shipped 2026-07-25)

Canonical phone URL:
`https://bens-mac-mini.taila1553c.ts.net:8446` — Tailscale Serve terminates
TLS and speaks **HTTP/2** to the browser, so the ~6-connection cliff does not
apply. Production is kept up by launchd
`com.bencharney.activityfeed.dashboard`.

The shape budget still applies — fewer streams mean less engine fan-out and
client recompute. Treat HTTP/2 as headroom, not a license to open more
streams. Details: [Tailscale and PWA](../deployment/tailscale-and-pwa.md).
