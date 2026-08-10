# Intake Review — Research-Scope Co-Pilot

- Idea: idea-001
- Recommendation: ready
- Risk level: medium

## Summary
A Buzz agent that helps research, scope, and create experiments — then stays with them as a co-pilot through the full lifecycle (monitor, document, surface decisions).

## Goal clarity
Test whether a Buzz agent can serve as an experiment co-pilot — reducing the friction of scoping, creating, and tracking experiments end-to-end.

## Success signal
3 experiments created and tracked through the co-pilot, with fewer stalled/forgotten experiments vs. manual tracking.

## Stop signal
After 3 experiments, if co-pilot tracking shows no improvement over manual, or if the agent cannot overcome the monitoring gaps.

## Repo / path
/Users/bencharney/activity-feed

## Review date
2026-08-15

## Duplicate check
No duplicate recorded.

## Missing pieces
- Need to define the co-pilot check-in cadence (daily? every 2 days?)
- Need to store experiment state in buzz mem core for persistence across sessions

## Risks
- Context window limits may cap how many experiments the co-pilot can juggle simultaneously
- No autonomous scheduling — co-pilot only checks in when pinged. Could miss drift if Ben forgets to check

## Eval plan
Track 3 experiments through the full co-pilot lifecycle. Compare against the baseline (ad-hoc experiments in #experiments channel). Measure: number of forgotten/stalled experiments, time-to-scope, documentation completeness.

## Test tasks
- Create one experiment and have the co-pilot track it for 2 weeks, logging at least 2 check-ins
- Run a research/scoping session for a new experiment idea and measure time-to-intake
- After 3 experiments, compare co-pilot-tracked vs. untracked experiments for stall rate
- Test: can the co-pilot recover from a session restart and remember experiment state?

## Notes
- None yet.
