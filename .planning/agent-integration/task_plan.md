# Task Plan: Agent Runtime Visibility on Activity Dashboard

## Goal
Surface iii harness (OVH VPS) + native Buzz agent (Mac Desktop) health, status, and activity in the existing activity dashboard — so Ben can see, at a glance, which agents are running, their health, and recent activity, without switching contexts.

## Current Phase
Phase 3

## Architecture Decision
- **No new pages.** Add agent cards/rows to the existing Fleet page under their respective hosts (iii under OVH, Buzz agents under Mac).
- **No new infra.** iii data via SSH + systemd queries, Buzz data via reading local `managed-agents.json` + `agent-pids/` on the Mac.
- **Reuse `agent_runs` table** for activity history (new `source` values: `iii`, `buzz-agent`).
- **New API routes** under `/api/agents/` for agent status. New feeder scripts for periodic sync.

## Phases

### Phase 1: iii harness health on OVH VPS — Fleet + agent_runs
- [x] Create `/api/agents/iii-health` route — queries OVH via SSH for engine status, memory (vs 4G/6G cgroup limit), active sessions, quarantined count, uptime
- [x] Show iii status row under OVH host card on Fleet page
- [x] Create feeder `feeders/iii-session-feed.js` — reads iii session JSONL from OVH, upserts into `agent_runs` with `source = 'iii'`
- [x] Add `iii` source to `agent-evidence.ts` so Runs tab covers iii
- [x] Verify: `npm run build` passes
- **Status:** complete

### Phase 2: Buzz Desktop agent status on dashboard
- [x] Create `/api/agents/buzz-agents` route — reads `managed-agents.json` + `agent-pids/` from Mac via SSH, returns running agents with status
- [x] Add Buzz agent rows under Mac host card on Fleet page (agent name, runtime, status dot, PID)
- [ ] Create feeder `feeders/buzz-agent-activity.js` — polls Buzz relay for agent-authored events (deferred — needs relay API auth)
- [ ] Add `buzz-agent` source to `agent-evidence.ts` (deferred — depends on feeder)
- [x] Verify: `npm run build` passes
- **Status:** complete

### Phase 3: Unified agent runtime health panel
- [x] Create Agent Health panel — all agents (iii, Buzz agents) with status, alerts, host labels
- [x] Add alert thresholds: iii memory pressure, Buzz agent crashes/errors
- [x] Verify: `npm run build` passes
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Read `managed-agents.json` directly from Mac filesystem | Dashboard runs on Mac Mini; local file read is zero-latency vs SSH to VPS |
| Use `buzz-agent` as source (not `buzz-acp`) | The native agent is `buzz-agent` binary; `buzz-acp` is the harness. Pubkey `02324fcc...` is the native Buzz agent |
| iii health via SSH from dashboard | iii engine has no HTTP endpoint; already have SSH access pattern from Fleet page |
| Fleet page as host, not new page | Existing Mac/OVH host cards are natural anchor points for agent info |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       |         |            |

## Notes
- Existing `task_plan.md` in root is for completed Portfolio Analytics work. This plan lives in `.planning/agent-integration/`.
- Buzz Desktop is running 5 agents: Buzz (native), Claude, Cursor, iii, Pi. Others (Honey, Bumble, Fizz) are stopped.
- Buzz native agent (`02324fcc...`) uses `buzz-agent` binary + `buzz-dev-mcp`, relay `wss://boobz.communities.buzz.xyz`, and has env vars for OpenAI-compatible LiteLLM proxy on Mac.
- iii on OVH has a history of OOM kills (INC-2026-07-30). Memory dashboard visibility directly addresses that.
