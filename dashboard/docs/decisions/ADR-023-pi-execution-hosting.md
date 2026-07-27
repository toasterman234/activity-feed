# ADR-023: Pi execution hosting

## Status

Superseded by [ADR-024](ADR-024-atomic-ovh-releases-and-pi-readiness.md) on
2026-07-27.

## Context

The issue resolution pipeline (ADR-013) creates linked, repo-bound execution
tasks from approved plans. The user can select Pi as the execution agent and
click "Create execution task." However, posting `@pi` in a channel launches a
restricted Pi process on OVH with `--no-tools`, so Pi can discuss the issue but
cannot edit files, run commands, or execute the plan.

The user asked: "Why can't Pi just run and execute on OVH?"

## What's deployed today

- **Channel `@pi` on OVH**: `child_process.execFile` spawns `pi -p` with
  `--no-tools`. Pi can read and discuss but cannot act.
- **Alternative — `@pi` on the Mac**: a Pi worker would have full tool access
  (file editing, shell commands, git) but depends on the Mac being awake and
  reachable.

## Root causes preventing Pi execution on OVH

1. **`--no-tools` is hardcoded**: the channel trigger route passes `--no-tools`
   to every Pi spawn, regardless of context. Pi cannot edit files or run commands.
2. **OVH has production files, not a dev checkout**: the dashboard's deployed
   source is in `/home/ubuntu/activity-feed/dashboard/`, which is rsync'ed from
   the Mac and overwritten on every deploy. Any changes Pi makes would be
   destroyed by the next deploy.
3. **No worktree or isolation**: Pi would need a separate checkout (worktree
   or clone) with its own `node_modules`, so it doesn't interfere with the
   running production service.
4. **Pi is not installed on OVH**: no `pi` binary, no agent config, no MCP
   connections, no model access (needs LiteLLM or cliproxy routing from a
   reachable host).

## Paths forward (not yet implemented)

### A — Pi worker on the Mac (recommended short-term)
- Keep OVH as the UI and coordination layer.
- When an execution task targets Pi, the Mac-side feeder picks it up and spawns
  a full-featured Pi agent with worktree isolation.
- Pi reports results back to the OVH Postgres `work_runs` table.
- **Blockers**: none technical — the Mac already runs Pi and has developer
  checkouts. Needs a feeder/poller on the Mac.

### B — Install Pi on OVH with a worktree
- Install `pi` globally on the VPS.
- Create isolated worktrees for execution tasks (e.g.
  `/home/ubuntu/agent-worktrees/<task-id>/`).
- Route model calls through cliproxy on the Mac or ZimaOS LiteLLM.
- Remove `--no-tools` for execution-stage spawns.
- **Blockers**: needs Pi npm global install, agent config, MCP server
  access (registry might not work from OVH), model routing, worktree lifecycle
  management, and a guarantee that production files are never touched.

### C — Unified compute via newagent/herdr
- `newagent` already probes Mac, Zima, and OVH for the least-loaded host
  (see ben-agents3 `context/infrastructure.md`).
- Extend the execution handoff to use `newagent` instead of local `pi` spawn.
- **Blockers**: herdr adds session persistence overhead; need to confirm
  that a herdr-spawned Pi can access the correct worktree and return results
  to the OVH `work_runs` table.

## Decision

The deferred decision was resolved in favor of OVH execution with isolated Git
worktrees. Pi, its provider, execution-stage tools, durable work runs, and
worktree setup are installed. ADR-024 records the readiness checks and the
atomic deployment boundary that keeps execution work separate from production.

## Consequences

### Current
- Execution tasks targeting Pi create assignments but do not run automatically.
- Durable work-run tracking (ADR-011) is in place and will capture outcomes
  once execution is implemented.

### When resolved
- The activity dashboard becomes a true autonomous execution platform:
  Issue created → Plan approved → Execution task → Pi worker → Verification
  feedback → Resolution.

## References

- [ADR-011](ADR-011-durable-work-runs.md) — durable work runs
- [ADR-013](ADR-013-approved-plan-execution-handoff.md) — execution handoff
- ben-agents3 `context/infrastructure.md` — unified compute via herdr
