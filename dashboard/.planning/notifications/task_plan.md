# Task Plan: Phone Push Notifications for Activity Dashboard

## Goal
Deliver real, configurable phone push notifications from the Activity Dashboard PWA using Web Push + VAPID keys. Notifications originate from authoritative dashboard events, respect preferences, survive restarts, and deep-link to the exact item.

## Current Phase
Phase 6

## Phases

### Phase 1: Event catalog, DB schema, VAPID keys
- [x] Define notification event catalog + safe payload contract (ADR-027)
- [x] Create PostgreSQL tables (5 tables in 006-notifications.sql)
- [x] Write rollback migration (scripts/rollback-notifications.sql + .mjs)
- [x] Generate VAPID keys on OVH, expose via GET /api/notifications/vapid-public-key
- **Status:** complete

### Phase 2: Service worker + device enrollment
- [x] Extend Serwist SW with push display, notification click, subscription refresh, app badge
- [x] Build device enrollment API (subscribe/unsubscribe/list)
- [x] Build "Enable phone notifications" in-app flow with device naming, removal, test delivery
- **Status:** complete

### Phase 3: Notification Settings
- [x] Build Notification Settings API (GET/PUT/DELETE preferences with scoped overrides)
- [x] Master switch + 10 per-event-type toggles grouped by category
- [x] NotificationSettings UI component with toggle switches, wired into Config tab
- **Status:** complete

### Phase 4: Outbox + delivery worker
- [x] Create transactional outbox fed by workflow, work-run, verification, approval, deployment events
- [x] Implement durable OVH delivery worker with preference evaluation, retries, invalid-sub cleanup
- [x] Add observability (structured logs, timer status)
- [x] Set up systemd timer (30s interval on OVH)
- **Status:** complete

### Phase 5: In-app notification inbox
- [x] Notification inbox UI (expandable bell, unread badge, polling)
- [x] Direct navigation from notification to target item (Link via app_url)
- [x] GET/PUT /api/notifications/inbox with pagination, read-all, dismiss
- [x] Delivery worker writes to notification_inbox on dispatch
- **Status:** complete

### Phase 6: Tests, phone verification, staged deploy
- [x] Contract smoke tests for outbox idempotency, inbox CRUD, preferences, subscriptions uniqueness
- [ ] Real phone verification on iPhone Home Screen PWA and Android
- [ ] Staged deploy with delivery health monitoring
- **Status:** in_progress

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Web Push + VAPID (no Firebase) | Corrected plan; existing Serwist SW; no vendor lock-in |
| PostgreSQL via `pg` (no Prisma) | Real architecture confirmed by ADR-015 grounding |
| PushSubscription model in DB | Required to persist device tokens for delivery |
| Durable outbox pattern | Survives restarts; transactional consistency with event sources |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       |         |            |

## Notes
- Source thread: OVH coding thread 246f0017 (state: running)
- Source plan: corrected reviewed plan (not the Prisma one)
- ADR-015 documents the planning incident and grounding fix
- All tasks reference OVH production; deploy after each phase with `npm run deploy:ovh`
