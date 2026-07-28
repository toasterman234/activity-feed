# Findings — Issue Resolution Pipeline

- Production already has workflow-first threads, immutable workflow templates, transition gates, artifacts, approvals, repo targeting, agent telemetry, and judgment collections.
- Current agent execution is request-bound and its thread-local run IDs do not join to `agent_runs`.
- One legacy workflow step remains stuck in `running`, demonstrating the need for leases and stale-run recovery.
- The repository contains extensive unrelated active work; new code will be isolated and existing files will receive only narrow edits.
- Production now has the complete control-plane loop: approved plan handoff → repo-bound execution task → durable attempt record → repository checks → failed-check feedback → bounded retry → human verification/close.
- The remaining automation boundary is a worker transport, not another tracker feature. AgentField is degraded, Pi orchestration is retired, the Mac executor is loopback-only, and the OVH app checkout is rsynced without `.git`.
- Enabling unattended code mutation on OVH would therefore be unsafe: it cannot create truthful worktrees from the deployed source and would bypass the current routing doctrine.
