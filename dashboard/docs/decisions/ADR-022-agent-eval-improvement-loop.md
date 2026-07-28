# ADR-022: Agent evaluation and improvement loop

## Status

Accepted — executed 2026-07-27.

## Context

The Fleet → Registry tab exposed Pi and Claude agent profiles with their
tools, skills, models, and subagents. But there was no mechanism to evaluate
agent performance, track outcomes per session, or feed improvements back into
the agent configuration. 1,496 normalized agent runs existed across Claude Code
(1,371) and Pi, but they were raw data with no outcome classification or
feedback loop.

## Decision

Build a lightweight eval pipeline that lives in the dashboard and feeds into
the agent registry:

1. **Agent run normalization**: bridge `timeline.db` (from the timeline feeder)
   into structured `agent_runs` in Postgres with source, session ID, outcome,
   and project attribution.
2. **Auto-judge feeder**: LLM-based rubric that classifies run outcomes as
   success, drift, or unknown. Runs as a Mac-side feeder writing into OVH
   Postgres. Phase-guarded to prevent concurrent hook overwrites.
3. **Agent run metrics dashboard**: Activity → Runs tab shows per-agent success
   rates, drift rates, and recent sessions with outcomes.
4. **Eval set builder**: generates structured evaluation scenarios from actual
   sessions. "Build an evaluation set" opens Activity → Collections.

### Integration with Registry
Opening Pi or Claude in Fleet → Registry now shows:
- Stable agent identity mapped from session sources
- Run totals with success/drift/unknown breakdown
- Recent sessions with project, session ID, outcome, and timestamp
- Available eval sets and improvement suggestions

### Rejected alternatives
- **External eval platform (Langfuse, Weave)**: separate system with different
  auth and billing; dashboard integration is simpler and already has the data.
- **Manual run review**: unscalable at 1,496 runs.

## Consequences

### Positive
- Agent performance is visible alongside agent configuration.
- Auto-judge runs continuously without manual intervention.
- Eval sets can be built from real sessions, not hand-crafted scenarios.

### Negative / tradeoffs
- Auto-judge depends on LLM availability (uses a cheap model, not the
  primary agent model).
- Outcome classification is probabilistic and may misclassify edge cases.
- Timeline bridge is Mac-side only; pauses when the Mac sleeps.

## References

- [ADR-009](ADR-009-registry-read-model.md) — registry as read-only projection
- API: `src/app/api/agent-runs/`, `src/app/api/run-eval/`
- Feeder: `../feeders/` (in activity-feed repo)
