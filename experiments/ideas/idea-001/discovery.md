# Discovery — Research-Scope Co-Pilot

- Idea: idea-001
- Status: converted
- Recommendation: promising

## Problem
Experiments are created ad-hoc with no structured lifecycle tracking. Research/scoping is manual and inconsistent. No co-pilot stays with an experiment after creation — they drift, stall, or get forgotten. The existing tracker handles structured intake but has no autonomous monitoring, auto-documentation, or lifecycle coaching.

## Desired outcome
A Buzz agent that acts as an experiment co-pilot: researches and scopes new experiment ideas, creates them with structured docs, monitors them throughout their lifecycle, auto-logs runs, surfaces stall risks, and coaches lifecycle decisions.

## Decision this should inform
Whether to invest in making experiments a first-class Buzz workflow vs. continuing with ad-hoc creation and manual tracking.

## Current workflow
Ben thinks of an idea, mentions it in channel, maybe creates files manually, runs the experiment, maybe documents results later — no structured intake, no lifecycle tracking, no co-pilot.

## Constraints
- Must work within current Buzz agent capabilities (no autonomous scheduling yet — relies on mentions and memory)
- Tracker persistence via existing CLI (experiment_tracker.py) — don't rebuild persistence layer
- Must handle 3-5 concurrent experiments without context overload
- Must work within current Buzz agent capabilities — no autonomous scheduling yet, relies on mentions and memory
- Tracker persistence via existing CLI — do not rebuild persistence layer

## Similar GitHub projects
- steveyegge/beads — in-repo issue tracking that could serve as the experiment state backend
- langfuse/langfuse — experiment tracking and eval for LLM apps (reference pattern)
- promptfoo/promptfoo — eval framework for LLM outputs (test task inspiration)

## Web research
- The Adam Rabb pipeline (../../REPOS/adam-rabb-pipeline/) — a real, working example of structured research/discover/plan/decide/experiment workflow in the same ecosystem
- The Adam Rabb pipeline in ../../REPOS/adam-rabb-pipeline/ — a real, working example of structured research/discover/plan/decide/experiment workflow

## Patterns worth copying
- The Adam Rabb pipeline's stage-gated workflow: frame→discover→plan→experiment→decide→ship→reflect — a proven multi-stage lifecycle
- Beads in-repo issue tracking — experiments could be tracked as in-repo issues that follow branch workflow
- The iii agent ecosystem already has session management, memory search, and next-action suggestions — the building blocks for a co-pilot
- The Adam Rabb pipeline stage-gated workflow — frame→discover→plan→experiment→decide→ship→reflect — a proven multi-stage lifecycle

## Open questions
- How much of the co-pilot should live in agent memory vs. the tracker's registry.json?
- What's the minimal monitoring signal — last update timestamp? Number of runs? Something else?
- Should the co-pilot eventually be a separate agent, or is it better as a skill loaded by any agent?
- How much of the co-pilot should live in agent memory vs. the tracker registry.json?
- What is the minimal monitoring signal — last update timestamp? Number of runs? Something else?

## Notes
- None yet.
