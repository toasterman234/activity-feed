# Experiments

This folder is the local source of truth for idea capture, discovery, intake, and experiment tracking.

## Files

- `registry.json` — machine-readable state for both ideas and experiments
- `ideas/<id>/IDEA.md` — raw captured idea
- `ideas/<id>/discovery.md` — research and inspiration notes before creation
- `ideas/<id>/intake.md` — readiness review and recommendation
- `<experiment-id>/README.md` — main experiment doc
- `<experiment-id>/evals.md` — eval plan / test tasks
- `<experiment-id>/runs.md` — run log template
- `CANVAS.md` — generated dashboard summary

## Intended flow

1. Capture an idea first.
2. Add discovery research and inspiration.
3. Run intake to decide if it is ready.
4. Create the actual experiment only after intake.
5. Keep experiment docs updated over time.

## Idea statuses

- `captured`
- `discovering`
- `reviewed`
- `approved`
- `rejected`
- `converted`

## Experiment statuses

- `proposed`
- `active`
- `paused`
- `done`
- `killed`

## Current scope

This is local-only.
It does not post to Buzz directly yet.
