# ADR-011: Repository verification profiles and issue feedback

- Status: Accepted
- Date: 2026-07-27

## Context

Issue attempts can now be traced durably, but a successful agent reply is not proof
that a repository change works. Verification also differs by repository, and failed
checks need to become structured input to the next resolution attempt.

## Decision

Store one versioned-by-update verification profile per repository. A profile contains
an ordered set of bounded shell checks, a working directory, a timeout, and a maximum
number of feedback cycles. Record every check against the durable work-run attempt.

When an Issue attempts to move from Resolve to Verify, run the target repository's
profile. Required failures block the transition and create a feedback-cycle record
that can be supplied to the next attempt. Passing checks allow the normal lifecycle
transition and human review gates to continue.

The system does not add another Electric shape. Run and check views use request-time
API reads and short polling while visible.

## Consequences

- Repository onboarding must define or confirm its verification commands.
- A conversationally successful attempt may still finish as failed when its required
  verification fails.
- Raw command output remains bounded in Postgres; larger logs should use `raw_ref`.
- Retrying remains bounded by both the work-run attempt cap and the profile feedback cap.
