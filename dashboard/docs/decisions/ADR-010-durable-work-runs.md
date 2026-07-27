# ADR-010: Durable work runs join issues, agents, repositories, and evidence

## Status

Accepted

## Date

2026-07-27

## Context

Channel agent invocations currently exist only as request-bound processes,
presentation-level workflow steps, and short-lived thread activity events. Their
run IDs do not join to normalized `agent_runs`, stable Registry agents, immutable
agent configurations, repositories, or issue stages. A process interrupted by a
deployment can leave ambiguous or stale state.

## Decision

Add `work_runs` as one durable row per execution attempt. A request groups retries;
each attempt records the issue/thread and stage, stable Registry agent identity,
configuration hash and snapshot, repository context, worker lease and heartbeat,
trace reference, structured result, and error.

OVH remains the workflow control plane. Execution workers may later run on OVH,
the Mac, or another registered host near the target repository. Workers claim
queued attempts with leases; expired attempts become interrupted rather than
silently remaining active.

`thread_workflow_steps` remains the user-facing step projection.
`thread_activity_events` remains the short live trace. Both will reference the
same durable work-run ID when an agent attempt is instrumented.

## Alternatives considered

### Add more fields to `thread_workflow_steps`

Rejected. A step is a display/log concept and cannot cleanly represent retries,
leases, immutable agent versions, repository revisions, or multiple attempts.

### Use `agent_runs` as the execution queue

Rejected. It is normalized historical telemetry from several harnesses and uses
session IDs where stable agent identities are needed. Mutating it into an
operational queue would mix ingestion history with control-plane state.

### Introduce a separate external issue tracker

Rejected. Threads already own issue identity, lifecycle state, messages, plans,
artifacts, approvals, and history. A second tracker would split authority.

## Consequences

- Issue resolution can be traced to a specific agent/config/repository attempt.
- Interrupted and retried work becomes explicit.
- Future eval and regression results have a durable join target.
- The schema is additive; existing behavior is unchanged until instrumentation
  is enabled.
- Worker dispatch and UI integration remain separate incremental slices.

## Rollback

Disable all writers/readers first, export any production rows, then apply
`scripts/rollback-work-runs.sql`.

