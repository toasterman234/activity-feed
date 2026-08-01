# Progress Log: Agent Runtime Visibility on Activity Dashboard

## Session: 2026-07-31 — Initial Research + Plan Creation

### Completed
- Scoped task: iii harness (OVH VPS) + native Buzz agent (Mac Desktop) → activity dashboard
- Discovered Buzz Desktop agent state: `managed-agents.json` (9 agents configured, 5 running), `agent-pids/`, logs, retention DBs
- Identified native Buzz agent: pubkey `02324fcc...`, runtime `buzz-agent` + `buzz-dev-mcp`, relay `wss://boobz.communities.buzz.xyz`
- Mapped OVH Buzz relay Postgres schema (events, channels, users, workflows, workflow_runs) — 0 agents registered, essentially unused
- Reviewed iii engine incident (INC-2026-07-30-iii-oom) — MemoryHigh=4G, MemoryMax=6G, history of OOM kills
- Mapped dashboard existing agent infrastructure: `agent_runs` table, `/api/agents/`, `/api/agent-runs/`, `agent-evidence.ts`, Fleet page
- Created task_plan.md with 3 phases
- Created findings.md with full reconnaissance data

### Test Results
- N/A (planning phase, no code written)

### Next Steps
- Ben approval on the plan, then begin Phase 1

## Session: 2026-08-01 — Phase 1 Complete

### Completed
- Created `/api/agents/iii-health` route — systemctl show + session JSONL parsing, deployed to OVH
- Added `IiiHealth` type to `fleet.ts`, `iiiHealth` field to `FleetHost`
- Updated `fleet-server.ts` with `fetchIiiHealth()` — runs `systemctl show iii` locally on OVH
- Updated Fleet page UI — iii engine card under OVH host with memory gauge (4.4G/5G, 87% pressure), sessions (5 done, 4 errored), tasks (436)
- Created `feeders/iii-session-feed.js` — reads /opt/iii/data/session-manager/ JSONL, upserts into agent_runs
- Added `iii-harness` → `["iii"]` mapping in `agent-evidence.ts`
- Updated `/api/agents/list` to query real systemd status instead of hardcoded "connected"
- Deployed to OVH and verified: API returns live data, Fleet snapshot includes iiiHealth

### Test Results
- `npm run build` passes (all checks: shapes, shell, routes, plans)
- `feeders/iii-session-feed.js` inserted 9 iii sessions into agent_runs (5 success, 4 failed)
- `curl http://localhost:3000/api/agents/iii-health` returns live iii engine health
- `curl http://localhost:3000/api/fleet` returns iiiHealth in OVH host

### Next Steps
- Phase 2: Buzz Desktop agent status on dashboard

## Session: 2026-08-01 — Phase 2 Complete

### Completed
- Created `/api/agents/buzz-agents` route — SSHs to Mac, runs `scripts/buzz-agents-status.py`, returns 16 agents (5 running)
- Created `scripts/buzz-agents-status.py` — parses `managed-agents.json` + `agent-pids/` on Mac
- Added `BuzzAgentsPanel` component to FleetPage — shows live agent list under Mac host card with status dots, names, runtimes, PIDs
- Added `BuzzAgentStatus` and `BuzzAgentsSnapshot` types to `fleet.ts`
- Integrated `fetchBuzzAgents()` into `buildFleetSnapshot()` — parallel fetch alongside metrics
- Deployed to OVH and verified: 8 agents displayed (5 running, 3 stopped)

### Test Results
- `curl /api/agents/buzz-agents` returns 16 agents, 5 running: Buzz (PID 32322, buzz-agent), Claude (PID 73397, claude), Cursor (PID 73290, cursor), iii (PID 73285, iii_bridge), Pi (PID 61894, pi_bridge)
- Fleet page shows Buzz agents under Mac host card
- `npm run build` passes

### Deferred
- `feeders/buzz-agent-activity.js` — needs Buzz relay API auth; lower priority since agent status is already visible
- `buzz-agent` source in `agent-evidence.ts` — depends on activity feeder first

### Next Steps
- Phase 3: Unified agent runtime health panel

## Session: 2026-08-01 — Phase 3 Complete

### Completed
- Created `/api/agents/health` route — unified agent health endpoint merging iii, Buzz, and Paseo agents
- Created `AgentHealthPanel` component on Fleet page — shows all agents with status dots, host labels, metrics, and alerts
- Alert thresholds: iii memory ≥80% triggers alert, iii engine down triggers alert, Buzz agent crash/error triggers alert
- Current state: 9 agents tracked, 5 running, 1 alert (iii memory 85%)

### Test Results
- `/api/agents/health` returns 9 agents: iii Engine (OVH, running), 8 Buzz agents (Mac, 5 running/3 stopped)
- 1 active alert: iii memory pressure 85% (4.2G/5G)
- Fleet page shows Agent Health panel with alerts banner and agent rows
- `npm run build` passes

### Next Steps
- Deferred: Buzz agent activity feeder (needs relay API auth)
