# ADR-021: Workflow stage workspaces — Frame, Challenge, Plan

## Status

Accepted — executed 2026-07-27.

## Context

After workflows were attached to every thread (ADR-007) and the Frame stage got
inline interview capability (ADR-008), the remaining stages were passive status
displays. Each stage showed "Ready when [condition]" but gave no workspace to
perform the work. Users had to go to the Conversation tab and manually write
`@pi` commands, with no feedback loop between the stage and the outcome.

The user reported loop confusion: "Challenge" → "Send back to Plan" → back to
Challenge, with no clear state transitions or guardrails.

## Decision

Convert every passive stage into an interactive workspace inline in the workflow
frame, so the stage card IS the workspace:

1. **Frame stage**: single input field → agent asks follow-up questions one at a
   time → proposed research frame → user approves or refines.
2. **Challenge stage**: shows proposed tasks and existing outputs, provides
   "Review plan" action, displays risks/corrections, consolidated revised plan,
   "Apply revised plan" and "Approve plan" buttons. Each action is gated:
   - "Approve" enforces that the plan was challenged and approved.
   - "Send back to Plan" bypasses completion-only checks (fixed loop bug).
3. **Plan stage**: inline task editor (add, delete, reorder), acceptance criteria
   and dependency fields per task, "Challenge this plan" button.
4. **Personal Context Scan**: runs after framing, searches Obsidian vault and
   agentmemory for related prior research before external evidence gathering.

### Stages are module-composable
Each workspace is a React component attached to a workflow stage definition.
Adding a new stage module requires: a stage definition in the lifecycle engine,
a workspace component, and a transition rule. No changes to the workflow frame
or thread page.

### Rejected alternatives
- **Separate workspace pages**: navigating away from the thread context breaks
  the mental model. Inline workspaces keep the state visible.
- **Conversation-tab-only interaction**: `@pi` commands are powerful but
  undiscoverable and have no guardrails for workflow state transitions.

## Consequences

### Positive
- Every stage has a clear "what to do next" action.
- The "Challenge → Send back → can't approve" loop is eliminated.
- Acceptance criteria and dependencies are first-class fields, not buried in
  plan text.
- Stage modules can be composed into new workflows via the Workflow Registry.

### Negative / tradeoffs
- Each new workflow lifecycle needs bespoke workspace components.
- Stage UI changes require a full deploy (no runtime stage editing).

## References

- [ADR-007](ADR-007-workflow-first-threads.md) — thread workflow model
- [ADR-008](ADR-008-inline-frame-and-personal-context.md) — Frame stage
- [ADR-010](ADR-010-versioned-workflow-registry.md) — composable stage modules
- [ADR-015](ADR-015-grounded-plan-review-gates.md) — plan verification gates
