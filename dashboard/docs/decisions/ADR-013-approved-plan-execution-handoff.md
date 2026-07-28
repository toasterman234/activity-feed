# ADR-013: Preserve approved plans and create linked execution tasks

## Status

Accepted

## Date

2026-07-27

## Context

The Planning lifecycle ends with an approved, ordered task set. The original UI
offered only project promotion after approval. That conflated four different user
intentions:

- execute now inside an existing repository;
- associate the plan with an existing project but execute later;
- create a new standalone project;
- retain the approved plan without starting anything.

Starting work also needs an explicit target repository, executor, and authority
boundary. An ordered plan describes what should be done, but does not authorize
commits or deployment and does not prove that the selected repository is available
on the execution host.

## Decision

An approved Planning thread remains immutable planning provenance. It is never
converted in place into a Coding or Issue thread.

The `execution-handoff` workflow module presents the post-approval choices. Starting
execution requires:

- a registered repository/project;
- a named executor;
- an explicit authority level;
- a non-empty approved task set;
- a repository path available on the execution host.

Starting creates a linked Coding thread, copies the approved ordered tasks, pins the
current Coding workflow template, binds the repository and assignee, and records an
`executes` relationship in `thread_links`. The execution brief carries the source
plan ID and authority boundary. Existing active execution links are returned
idempotently rather than duplicated.

Linking without execution only sets the Planning thread's `repo_id`. New standalone
project creation continues through the existing promotion path. Doing nothing is a
valid state; no work starts implicitly.

## Alternatives considered

### Convert the Planning thread into Coding

This produces a simple URL and no relationship table, but destroys the distinction
between an approved decision record and mutable delivery work. It also makes review
history and later replanning ambiguous.

### One comprehensive execution manifest

A single form could expose branch, worktree, agent version, verification commands,
commit policy, deployment, rollback, and secrets. It is complete but too shallow:
the user must understand every execution concern on every handoff. Repository
profiles and durable work runs should own those details.

### Promote every plan to a project

Promotion is appropriate for genuinely new standalone work, but it duplicates an
existing project when the work already belongs to a registered repository. It also
archives the planning task and adds scaffolding when only a linked delivery task is
needed.

## Consequences

- Approved plans remain durable provenance.
- Projects can aggregate planning and execution through `repo_id` and `thread_links`.
- Execution cannot begin against a repository path unavailable to the current host.
- Commit and deploy authority are explicit instead of inferred from “start.”
- The execution task can use the durable work-run and verification pipeline without
  coupling those operational details to Planning.
- `thread_links` becomes the general lineage primitive for future plan, issue,
  execution, and follow-up relationships.
