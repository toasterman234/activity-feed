# Task Plan: Phone Push Notifications for Activity Dashboard

## Goal
Deliver real, configurable phone push notifications from the Activity Dashboard PWA using Web Push + VAPID keys. Notifications originate from authoritative dashboard events, respect preferences, survive restarts, and deep-link to the exact item.

## Current Phase
Phase 1

## Phases

### Phase 1: Event catalog, DB schema, VAPID keys
- [ ] Define notification event catalog + safe payload contract (doc)
- [ ] Create PostgreSQL tables for notifications, subscriptions, preferences, outbox, delivery attempts
- [ ] Write rollback migration
- [ ] Generate VAPID keys on OVH, store securely, expose public key to client
- **Status:** in_progress

### Phase 2: Service worker + device enrollment
- [ ] Extend Serwist SW with push display, notification click, subscription refresh, app badge
- [ ] Build device enrollment API (subscribe/unsubscribe/list)
- [ ] Build "Enable phone notifications" in-app flow with device naming, removal, test delivery
- **Status:** pending

### Phase 3: Notification Settings
- [ ] Build Notification Settings API (get/update preferences)
- [ ] Master switch, event-type, channel, project/repo, workflow, agent, task-level controls
- [ ] Settings UI page
- **Status:** pending

### Phase 4: Outbox + delivery worker
- [ ] Create transactional outbox fed by workflow, work-run, verification, approval, deployment events
- [ ] Implement durable OVH delivery worker with preference evaluation, retries, invalid-sub cleanup
- [ ] Add observability (logs, metrics)
- **Status:** pending

### Phase 5: In-app notification inbox
- [ ] Notification inbox UI (unread state, filters, mark-read)
- [ ] Direct navigation from notification to target item
- [ ] Real-time unread badge (Electric shape)
- **Status:** pending

### Phase 6: Tests, phone verification, staged deploy
- [ ] Contract and integration tests (preference precedence, deduplication, payload privacy, retries, deep links)
- [ ] Real phone verification on iPhone Home Screen PWA and Android
- [ ] Staged deploy with delivery health monitoring
- **Status:** pending

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
