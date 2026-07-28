# ADR-007: Threads are versioned workflow instances with an event ledger

## Status

Accepted — shipped 2026-07-27.

## Context

Channels originally treated a root `messages` row as the thread identity and
attached lifecycle metadata only when a user or agent explicitly selected a
lifecycle. Production had 46 root threads but only 27 `thread_meta` rows. A
thread could therefore exist without a lifecycle, current stage, workflows, or
guided next action.

The state machine itself already enforced legal transitions and command gates,
but `thread_meta.state` was overwritten in place. Historical transitions had to
be inferred from system chat lines and workflow-step logs. Plans and artifacts
were thread-wide rather than associated with the stage that produced them.

## Decision

Treat every root channel message as a durable work-item identity and create its
workflow instance in the same database transaction.

The workflow contract is:

- `thread_meta` is the current-state projection and pins `template_version`.
- Lifecycle definitions remain version-controlled in
  `src/app/channels/lifecycles.ts` and describe stage purpose, requirements,
  expected outputs, and approval policy.
- `thread_workflow_events` is the append-only authority for workflow creation,
  template changes, transitions, failed gates, and completion.
- `thread_plans.stage_id` and `thread_artifacts.stage_id` associate work and
  outputs with the stage in which they were produced.
- Thread secondary data remains polled through `thread-extras`; no additional
  Electric live shapes are opened.
- The thread UI is a workflow cockpit. Stage position, obligations, outputs,
  tasks, and runs are primary; conversation is a secondary tab.

`messages.id` remains the work-item ID for this increment. Introducing a
separate identity table would require a destructive relationship migration
without producing additional user value today.

## Alternatives Considered

### Keep lifecycle metadata optional

Rejected. Optional lifecycle rows are the direct cause of unmanaged threads and
make channel defaults advisory instead of enforceable.

### Replace threads with a new `work_items` table immediately

Deferred. A separate work-item identity may eventually be useful, but migrating
every message, plan, artifact, promotion, graph record, and URL would be
high-risk. The existing root message UUID is already a stable identity.

### Reconstruct history from messages and workflow steps

Rejected. Presentation text and operational logs are not a reliable audit
ledger. They do not consistently record actor, template version, requested
transition, gate result, or resolved transition.

### Store user-authored templates in the database now

Deferred. Runtime semantics need to stabilize first. Version-controlled
templates make changes reviewable and prevent a visual editor from becoming a
second execution engine.

## Consequences

### Positive

- A root thread and its workflow instance cannot diverge during creation.
- Old threads remain interpretable after templates change.
- Transition and gate history is explicit and queryable.
- Tasks and outputs can be evaluated in the context of the active stage.
- The UI can explain what the current stage means and what must happen next.
- The implementation stays within the four-live-shape page budget.

### Tradeoffs

- Current state is deliberately duplicated: `thread_meta.state` is the fast
  projection, while the event ledger is the historical authority.
- Workflow templates have a UI editor at `/workflows` (create/edit); DB-backed user-authored template store remains deferred.
- Requirement completion uses existing tasks, artifacts, and workflow steps;
  a dedicated approval record is a future extension.

## Migration and rollback

`scripts/init-workflow-cockpit.mjs` is idempotent. It adds columns and the event
table, assigns defaults to channels, backfills missing workflow instances, and
creates one deterministic `workflow.created` event per existing thread.

Rollback is behavioral: deploy the prior UI/runtime while leaving additive
columns and event rows in place. No existing table or data needs to be deleted.

## Do not regress

- Never insert a root `messages` row without creating its workflow instance in
  the same transaction.
- Never update lifecycle state without recording the resulting workflow event.
- Never derive audit history solely from chat messages.
- Never add a live shape for workflow events, stage tasks, or artifacts; extend
  the polled `thread-extras` response instead.
- Never reinterpret an existing workflow instance using an unpinned template
  version.

## References

- Lifecycle catalog: `src/app/channels/lifecycles.ts`
- Atomic creation: `src/app/api/channels/write/route.ts`
- Transition ledger: `src/app/channels/transitionThread.ts`
- Event writer: `src/lib/workflowEvents.ts`
- Cockpit UI: `src/app/channels/WorkflowCockpit.tsx`
- Migration: `scripts/init-workflow-cockpit.mjs`
- Shape budget: ADR-003
