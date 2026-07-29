# ADR-027: Notification Event Catalog & Payload Contract

## Status

Accepted

## Date

2026-07-29

## Context

The coding thread 246f0017 calls for a defined notification event catalog before
any implementation. Notifications originate from authoritative dashboard events
and must carry enough context to deep-link, without leaking sensitive payload
data into push notification bodies.

## Decision

### Event Sources (authoritative)

| Event | Source Table / Path | Trigger Condition |
|---|---|---|
| `workflow.blocked` | `thread_workflow_events` | A stage transition is blocked by gate failure |
| `workflow.approval_required` | `graph_proposals` | A proposal enters `pending_approval` state |
| `work_run.completed` | `work_runs` | `status = 'completed'` after previously `running` |
| `work_run.failed` | `work_runs` | `status = 'failed'` |
| `work_run.interrupted` | `work_runs` | `status = 'interrupted'` (timeout, cancel) |
| `verification.passed` | `work_run_checks` | All checks for a stage resolve `passed` |
| `verification.failed` | `work_run_checks` | Any check resolves `failed` |
| `deployment.completed` | `promotions` / `thread_promotions` | A promotion completes |
| `deployment.failed` | `promotions` / `thread_promotions` | A promotion fails |
| `task.reply` | `messages` | A message appears on a watched task thread |

### Notification Payload Contract

Every notification record carries:

```typescript
interface NotificationPayload {
  // Identity
  id: string;                    // UUID — idempotency key
  event: NotificationEventType;  // from catalog above
  urgency: "high" | "normal" | "low";

  // Target
  thread_id: string;
  channel_id: string;
  stage_id?: string;

  // Deep link
  app_url: string;               // absolute dashboard URL, e.g. /channels/{id}/{threadId}

  // Privacy-safe summary (what appears in push notification)
  title: string;                 // max 100 chars
  body: string;                  // max 200 chars
  icon?: string;                 // /icon-192.png

  // Metadata (stored server-side, never pushed)
  source_event_id: string;       // FK to triggering row
  actor?: string;                // "pi", "you (GuideBar)", etc.
}
```

### Privacy Rules

- Push notification body must NOT contain: code, error traces, file paths, personal data, API keys
- Push body is derived from `title` + `body` fields only
- The `app_url` is the canonical deep link — clicking the notification navigates there
- All rich metadata is in the in-app inbox, never in the push payload

### Idempotency

- `source_event_id` + `event` forms a compound idempotency key
- Outbox INSERT uses `ON CONFLICT (source_event_id, event) DO NOTHING`
- No duplicate notifications for the same event

## Alternatives Considered

### Push full event payload in notification body
Rejected: privacy risk, payload size limits, no guarantee the SW will receive it

### Use Firebase Cloud Messaging
Rejected: adds vendor dependency; existing Serwist SW already supports Web Push; VAPID is standards-based

### Fire-and-forget (no outbox)
Rejected: lost notifications on restart; no retry; no delivery tracking

## Consequences

- Every notification-producing code path must INSERT into the outbox table
- Delivery worker polls outbox, evaluates preferences, dispatches
- Push notification bodies are derived server-side
- Regression: event sources must be monitored — if a source stops emitting, notifications silently stop
