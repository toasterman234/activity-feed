# ADR-010: Versioned workflow registry and composable stage modules

## Status

Accepted

## Date

2026-07-27

## Context

The workflow cockpit had a reusable state-machine foundation, but lifecycle
definitions lived only in TypeScript. Research Frame, Personal Context Scan, and
their transition checks were selected with lifecycle-specific conditionals. Adding
or rearranging a lifecycle therefore required application code and a deployment,
and a numeric template version did not preserve the exact definition used by an
existing task.

## Decision

Use a validated `Lifecycle` definition as the standard workflow contract. A
definition contains:

- immutable identity and version;
- stages and legal transitions;
- reusable stage modules and their configuration;
- declarative exit gates;
- optional prompt or command workflows;
- requirements, outputs, approvals, and terminal behavior.

Published definitions are stored append-only in `workflow_templates`. Each
`thread_meta` row stores a complete `template_snapshot`, making the task's runtime
behavior independent of later registry changes.

Stage modules are selected through `WORKFLOW_MODULE_REGISTRY`. Server routes resolve
their availability from the current task's pinned definition rather than checking
for a lifecycle name. Exit gates are evaluated by type through the generic workflow
runtime.

The `/workflows` builder creates or clones a definition, arranges stages, attaches
registered modules, and publishes an immutable version. Editing an existing
registry ID creates the next version; it never changes an earlier version.

Approval-oriented stages use the reusable `guided-review` module. It inventories
the task, runs a stage-specific agent challenge, accepts inline feedback, writes a
review artifact, records explicit approval, and then performs the configured
approve or revise transition. Planning, Research, Coding, and Issue templates share
this module with different review instructions and output names.

Exit gates are transition-scoped through `toStates`. A completion gate must protect
only the transition it qualifies; it must not block recovery paths such as revise,
retry, reject, stop, or return-to-work. Review proposals are superseded when sent
back, and revision requests are recorded only after the backward transition
succeeds.

## Consequences

- New lifecycle arrangements are configuration, not application conditionals.
- A new module type still requires one implementation and registry entry, after
  which it can be attached to any compatible stage.
- Active tasks do not drift when a template is edited.
- Existing tasks are lazily snapshotted from their pinned bundled version.
- The first builder release intentionally creates a clear linear main path. More
  complex branch editing can be added without changing the stored contract.
- The existing polled thread-extras path carries snapshots; no live shape was added.

## Alternatives considered

### Keep definitions only in TypeScript

Simple, but every lifecycle change requires a deployment and active tasks cannot
prove which complete definition they use.

### Store only a mutable database definition

Easy to edit, but changing it would alter running tasks and make history
non-reproducible.

### Build separate screens and routes for each lifecycle

Allows bespoke UX but duplicates runtime rules and recreates the coupling this
decision removes.
