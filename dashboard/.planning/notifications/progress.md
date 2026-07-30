# Progress Log: Phone Push Notifications

## 2026-07-29

### 2026-07-29

### Phase 1 complete
- ADR-027: notification event catalog (10 event types, payload contract, privacy rules)
- 5 PostgreSQL tables applied on OVH: notification_subscriptions, notification_preferences, notification_outbox, notification_deliveries, notification_inbox
- VAPID keys generated (ECDSA P-256), stored in systemd Environment, verified public key endpoint
- GET /api/notifications/vapid-public-key returns {"ok":true,"publicKey":"..."}
- Deployed release 20260729T171547Z-d8fd4a1aef05-57441
- Schema verification: all 5 tables exist in activity-log-db

### Phase 2 complete
- Extended sw.ts: push event → showNotification (JSON payload with title/body/icon/badge/tag/vibrate),
  notificationclick → close + focus existing window / navigate / open new window
  pushsubscriptionchange → DELETE /api/notifications/subscribe for old endpoint
- POST /api/notifications/subscribe — register PushSubscription (Upsert on endpoint)
- DELETE /api/notifications/subscribe — remove by endpoint or id
- GET /api/notifications/subscriptions — list registered devices
- POST /api/notifications/test-delivery — sends test push via web-push + VAPID to all subscriptions
- EnableNotifications React component: permission request, pushManager.subscribe, naming,
  device list (rename/remove), test-delivery button, unsupported/blocked states
- Added 'Notifications' tab to Ops → Config page
- Fixed VAPID key format: raw 65-byte uncompressed EC point (web-push requirement)
- Systems: new key in OVH systemd, verified GET /api/notifications/vapid-public-key returns correct key
- Graph init: added `web-push` + `@types/web-push` dependencies

### Phase 3 complete
- GET/PUT/DELETE /api/notifications/preferences with scoped overrides
  (global → event_type → channel → project → workflow → agent → task)
- Master switch + 10 per-event-type toggles across 5 groups
- Server-computed effective settings with scope precedence
- NotificationSettings UI component: toggle switches, optimistic updates
- Verified: GET returns computed effective config, PUT creates global preference
- Deployed release 20260729T172839Z-bf97f7f2a22f-74450

### Phase 4 complete
- notificationEmit.ts: outbox writer, idempotent (source_event_id, event),
  12 event types with urgency mapping (high/normal/low)
- Hooked into transitionThread.ts: verification.passed, verification.failed
- Hooked into trigger/route.ts: work_run.completed, work_run.failed on both success and catch paths
- deliver-notifications.mjs: CRON-compatible Node.js delivery worker
  - Polls pending outbox (LIMIT 20), evaluates preferences
  - Checks global master switch + per-event-type toggles
  - Respects quiet hours (UTC-based window)
  - Dispatches via web-push to all subscribed devices
  - Records deliveries, cleans up invalid/expired subscriptions
  - Structured output: dispatched=N failed=N blocked=N skipped=N
- systemd timer: notifications-deliver.timer (every 30s, on-boot)
- Verified: timer active, service logs "no pending messages" (correct — no subscriptions yet)

### Phase 5 starting
- In-app notification inbox UI
- Unread badge and direct navigation
