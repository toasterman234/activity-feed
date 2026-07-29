# Agent Runtime Health Findings on OVH (2026-07-29)

## What exists

| Signal | Status | Details |
|---|---|---|
| `pi` binary | ✅ Present | `/home/ubuntu/.local/bin/pi` → `@earendil-works/pi-coding-agent` |
| `paseo` binary | ✅ Present | `/home/ubuntu/.local/bin/paseo` → `@getpaseo/cli` |
| `paseo` daemon | ❌ Not running | `ECONNREFUSED 127.0.0.1:6767` — daemon never started |
| `CHANNEL_PI_BIN` | ✅ Set | `/home/ubuntu/.local/bin/pi` in systemd Environment |
| `PATH` includes `.local/bin` | ✅ Yes | systemd service file line 29 |
| `work_runs` table | ✅ Functional | 1 row, last succeeded 2026-07-27 |
| `paseo ls --json` in systemd context | ✅ Works if daemon running | But daemon IS NOT running |

## Gap

Home overview (`src/app/api/home/overview/route.ts`) calls `paseo ls --json` via `getLiveAgents()`.
Since paseo daemon isn't running, this ALWAYS fails → `agentsDown: true` permanently.

## Real agent execution path

Channels use `/api/channels/trigger/route.ts` which spawns `pi -p` directly via `execFileNoStdin` — NOT paseo.
So `agentsDown: true` is a false alarm. Agents CAN run (pi is available), but the banner screams DOWN.

## Decision

Per BUILD spec: `runtimeOk = piBin === "ok"` for v1 on OVH.
- `piBin` check: `which pi` succeeds → `ok`
- `paseo`: `missing` (daemon not running), but does NOT force `runtimeOk: false`
- `workRuns`: query DB for any `running` with `heartbeat_at < 2min` OR any `succeeded` in last 24h
