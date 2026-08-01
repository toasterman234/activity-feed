# Experiment tracker

Local helper for capturing ideas, doing discovery + intake, and only then creating tracked experiments.

## What it does

- Captures rough ideas into `experiments/ideas/<id>/`
- Stores discovery notes before an experiment exists
- Stores intake reviews with a recommendation
- Creates or updates tracked experiments in `experiments/<id>/`
- Regenerates `experiments/CANVAS.md`
- Keeps all state in `experiments/registry.json`

## Main flow

1. `capture` — save a rough idea
2. `discover` — add research / inspiration / constraints
3. `intake` — evaluate whether the idea is ready
4. `create` — create the actual experiment after intake
5. `update` — keep experiment history current

## Example commands

### Capture an idea

```bash
python3 tools/experiment-tracker/experiment_tracker.py capture --text $'new idea: Research agent v1\ntype: agent\nsummary: Research agent for web + repo synthesis\nwhy now: I want better discovery before building\ngoal: Test whether a research agent can produce useful summaries\nsuccess signal: 4 of 5 tasks are useful without major edits\nstop signal: Fails 3 tasks in a row\nrepo path: /Users/bencharney/activity-feed\nreview: 2025-08-20\ntag: agents\ntag: research'
```

### Add discovery notes

```bash
python3 tools/experiment-tracker/experiment_tracker.py discover --id idea-001 --text $'problem: Research ideas are too fuzzy when they become experiments\ndesired outcome: A guided flow before creation\ngithub project: langfuse/langfuse\ngithub project: promptfoo/promptfoo\ninspiration: research before commitment\nconstraint: keep it local-first\nrecommendation: promising'
```

### Run intake

```bash
python3 tools/experiment-tracker/experiment_tracker.py intake --id idea-001 --text $'goal: Test whether a research agent can produce useful summaries\nsuccess signal: 4 of 5 tasks are useful without major edits\nstop signal: Fails 3 tasks in a row\nrepo path: /Users/bencharney/activity-feed\nreview: 2025-08-20\neval plan: Compare the agent against the current manual workflow on 5 tasks\ntest task: Summarize 3 similar GitHub projects\nrecommendation: ready'
```

### Create the experiment

```bash
python3 tools/experiment-tracker/experiment_tracker.py create --id idea-001
```

### Update the experiment later

```bash
python3 tools/experiment-tracker/experiment_tracker.py update --id research-agent-v1-01 --text $'status: paused\nsummary: Waiting on runtime fixes\nnote: The first run exposed missing web tooling'
```

## Compatibility

The older Buzz-style parser still works:

```bash
python3 tools/experiment-tracker/experiment_tracker.py parse --text $'new experiment: New agent harness\ngoal: Test a new harness flow'
```

Use `--root /path/to/project` to target a different workspace during testing.
