---
type: "Reference"
title: "Incident Report: iii Engine Double OOM Kill — 2026-07-30"
openwiki_generated: true
---

# Incident Report: iii Engine Double OOM Kill — 2026-07-30

**Incident ID:** INC-2026-07-30-iii-oom
**Severity:** High (engine kill, state loss, all agents frozen)
**Status:** Resolved (engine auto-restarted), recovery in progress
**Date:** 2026-07-30, ~01:00–05:05 UTC
**Reporter:** User (console freeze + refresh discovered agent loss)
**Affected System:** iii coding agent engine on OVH VPS (`ovhvps`, 135.148.41.9)

## Summary

The iii engine process was killed twice by the Linux OOM killer within a short window on July 30. The first kill was a global OOM; the second was a cgroup-constrained OOM. systemd auto-restarted the engine at 05:05 UTC. On restart, all in-memory agent state, running workers, and active sessions were lost. Three sessions that were active during the kill were auto-quarantined. The console UI showed empty agents/workers/sessions after refresh because the new engine instance had not rehydrated them.

## Timeline (UTC)

| Time | Event |
|------|-------|
| ~01:00 | Engine begins memory climb (precise start unknown) |
| ~04:02 | Another agent session investigates — greps journal for OOM/kill/Failed/fatal |
| ~04:03 | Same session checks dmesg for OOM events |
| ~04:37–04:45 | Three sessions active when OOM hits |
| ~04:45 | First OOM kill — `iii` (PID 1475224), 380MB anon RSS, killed by global OOM |
| ~04:45+ | systemd restarts iii (PID 1737193) |
| ~05:03 | Second OOM kill — `iii` (PID 1737193), 39MB anon RSS, killed by **memory cgroup** OOM (`CONSTRAINT_MEMCG`). `systemd-journald` also killed. |
| 05:03:52 | session-manager quarantines 3 active sessions |
| 05:05:56 | systemd restarts iii (PID 2811022) — current instance |
| ~15:00 | User notices console is frozen, refreshes, finds agents/sessions gone |

## Root Cause

**Memory cgroup exhaustion.** The iii service is constrained by systemd:

```
MemoryHigh=4G    # soft throttle
MemoryMax=6G     # hard cap (OOM killer fires here)
```

The comment in the config is telling: *"Worker swarms previously pushed this cgroup to 6–8Gi+ and OOM-killed iii."* This is a **repeat of a known problem.**

The current instance (16:55 UTC) shows:
- **4.1G memory usage** — already above MemoryHigh of 4G
- **506 tasks** in the cgroup
- **Multiple zombie `__watch-source` processes**: 8 instances for `workflow-console` alone (likely from repeated `iii-tududi-console` restarts)
- **5 managed VMs**: workflow-runner, prior-art, workflow-console, rca-engine, tududi-console

## Impact

- **User-facing:** Console appeared frozen. After refresh, agents, workers, and sessions were all missing from the UI.
- **Data loss:** 3 active sessions quarantined. Agent/walker state lost (in-memory only).
- **Session data preserved:** JSONL files intact on disk (9 quarantined, 5 active = ~17MB total). No permanent data loss.

## Current State

| Metric | Value |
|--------|-------|
| Engine | Active, uptime ~11h since 05:05 UTC restart |
| Memory | 4.1G / 6G max |
| Active sessions | 5 |
| Quarantined sessions | 9 (3 from the kill, 6 older) |
| Cgroup tasks | 506 |
| Zombie watch-source | 8 for workflow-console, 2 for rca-engine |

## Mitigation Applied

None yet. The engine auto-restarted. Memory pressure is still high and trending toward another OOM.

## Recommendations

1. **Immediate:** Cull zombie `__watch-source` processes (8x workflow-console duplicates)
2. **Short-term:** Reduce worker footprint — stop unused managed workers (prior-art? rca-engine? tududi-console?)
3. **Medium-term:** Raise MemoryMax to 8G or split workers into separate cgroups
4. **Long-term:** Add a healthcheck watcher that quarantines sessions *before* OOM, not after
5. **Recovery:** Un-quarantine the 3 sessions killed during the incident and verify they appear in the console
