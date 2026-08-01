# Findings: Agent Runtime Visibility on Activity Dashboard

## 2026-07-31 — Initial Reconnaissance

### Discovery: Buzz Desktop agent state on Mac
- **Path:** `~/Library/Application Support/xyz.block.buzz.app/agents/`
- **Key file:** `managed-agents.json` (582KB, ~756 lines JSON) — full agent configs with pubkey, name, persona_id, runtime, provider, model, system_prompt, env_vars, timestamps (created_at, updated_at, last_started_at, last_stopped_at), last_exit_code, last_error, is_active, respond_to
- **Running agents tracked in:** `agents/agent-pids/` — one JSON file per running agent with `{pubkey, relayUrl, pid, startedAt}`
- **ACP harness logs:** `agents/logs/<pubkey>__<hash>.log` — 8 files, 8–90KB each
- **Retention DBs:** `agents/retention/` — SQLite databases for message retention, one per agent
- **Teams:** `teams.json` — 1 team ("Welcome Team" with Fizz, Honey, Bumble)

### Discovery: 9 agents configured, 5 currently running
| Agent | Pubkey (first 8) | Runtime | PID | Relay | Status |
|-------|-----------------|---------|-----|-------|--------|
| Buzz | `02324fcc...` | `buzz-agent` + `buzz-dev-mcp` | 32322 | `wss://boobz.communities.buzz.xyz` | running |
| Claude | `c2c95dcd...` | `claude-agent-acp` | 73397 | `wss://boobz.communities.buzz.xyz` | running |
| Cursor | `c717aa9b...` | `cursor-agent` | 73290 | `wss://boobz.communities.buzz.xyz` | running |
| iii | `c509f86e...` | `iii_buzz_acp.py` | 73285 | `wss://boobz.communities.buzz.xyz` | running |
| Pi | `6f339436...` | `pi_buzz_acp.py` | 61894 | `wss://boobz.communities.buzz.xyz` | running |
| Honey (builtin) | `07f55782...` | `buzz-agent` (overridden to iii) | — | `wss://boobz.communities.buzz.xyz` | stopped |
| Bumble (builtin) | `4af77fc8...` | `buzz-agent` (overridden to iii) | — | `wss://boobz.communities.buzz.xyz` | stopped |
| Fizz (builtin) | `0299bb4b...` | `buzz-agent` (overridden to iii) | — | `wss://boobz.communities.buzz.xyz` | stopped |
| Honey (custom) | builtin duplicate | — | — | — | stopped |

### Discovery: Native Buzz agent details (the one Ben asked about)
- **Pubkey:** `02324fcc813b630157805aa90e1da43bd34fd62d0769dc52907042928d8dbb13`
- **Name:** "Buzz"
- **Runtime:** `buzz-agent` binary (native Rust ACP agent), `buzz-dev-mcp` for tool access
- **Provider:** `openai` (LiteLLM proxy on Mac at `http://100.71.118.10:18787/v1`)
- **Model:** `deepseek/deepseek-v4-pro`
- **Relay:** `wss://boobz.communities.buzz.xyz` (external community relay, not OVH)
- **parallelism:** 10
- **start_on_app_launch:** true
- **System prompt** instructs it to publish replies via `buzz messages send` with `--broadcast` and `--reply-to`

### Discovery: Global agent config
- **Path:** `agents/global-agent-config.json`
- **preferred_runtime:** `iii_bridge`
- **env_vars:** empty, **provider:** null, **model:** null

### Discovery: Buzz relay API (NIP-11)
- **Endpoint:** `https://ovh-vps.taila1553c.ts.net:8450` (OVH relay is separate from the desktop relay)
- **Health:** `{"status":"ready"}`
- **Software:** `https://github.com/block/buzz` v0.2.0
- **Supported NIPs:** 1, 2, 10, 11, 16, 17, 23, 25, 29, 33, 38, 42, 50, 56, 43
- **Push gateway:** origin `wss://ovh-vps.taila1553c.ts.net:8450`
- **Buzz Postgres:** `buzz-prod-postgres-1` container on OVH, tables: events, channels, users, workflows, workflow_runs, thread_metadata
- **users table** has `agent_type` and `agent_owner_pubkey` columns (agent-first design), but 0 registered agents in OVH DB
- **Only 1 channel:** "general", 8 total events in relay

### Discovery: iii engine on OVH
- **Service:** systemd-managed `iii` process
- **Cgroup limits:** MemoryHigh=4G, MemoryMax=6G
- **History:** Double OOM kill on 2026-07-30 (INC-2026-07-30-iii-oom)
- **Current state from incident doc:** 4.1G memory, 506 tasks, 5 active sessions, 9 quarantined
- **iii session binds** already wired into dashboard via `iii_session_binds` table and `iii-binds.ts` lib

### Discovery: Dashboard existing agent infrastructure
- **`agent_runs` table** — tracks agent sessions, current sources: `claude-code`, `omp`, `hook`
- **`/api/agents/list`** — calls `paseo ls --json`, hardcodes virtual `iii-harness` entry
- **`/api/agent-runs/overview`** — weekly trends, outcome stats, by-source breakdown
- **`/api/agent-runs/list`** — paginated, filterable by source/outcome/project
- **`agent-evidence.ts`** — maps `agent:claude` → `claude-code`, `agent:pi` → `omp`
- **Fleet page** — shows Mac/Zima/OVH hosts with CPU/mem/disk/containers, no agent-level detail
- **Fleet host config** in `fleet.ts` — OVH role: "Remote overflow worker and extra agent box", Mac: "Home base and interactive launcher"

### Discovery: Buzz ACP harness on Mac
- **Process:** `/Applications/Buzz.app/Contents/MacOS/buzz-acp` (3 instances)
- **Custom harnesses:** `iii_bridge.json`, `pi_acp.json`, `pi_bridge.json` in `custom_harnesses/`
- **Buzz CLI** not installed on OVH (`buzz: command not found`)

## Key Takeaways
- Buzz Desktop `managed-agents.json` is the single source of truth for agent config + lifecycle — readable as a local file
- Native Buzz agent (`02324fcc...`) is the one to track; uses `buzz-agent` binary (Rust, native) not a Python bridge
- iii engine health should be polled via SSH from dashboard (same pattern as Fleet inspect)
- OVH Buzz relay is essentially unused — agent activity is on `boobz.communities.buzz.xyz`
- Dashboard already has `agent_runs` table and evidence system — just needs new `source` entries
- Fleet page's Mac host card is the natural location for Buzz agent status (agents run on Mac)
- Fleet page's OVH host card is the natural location for iii engine status
- No new database tables needed; `agent_runs` can handle both sources
