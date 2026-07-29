# BUILD SPEC — Agent runtime health on OVH (for pi)

**Status:** ready to implement  
**Audience:** pi agent  
**Workdir:** `/Users/bencharney/activity-feed/dashboard` (+ ops on OVH as noted)  
**Depends on:** Home already shows `Agent runtime is down` when `paseo ls` fails  
**Index:** `PLAN-workflow-next.md`

## Goal

Make “Agents” on Home **truthful and actionable**:

1. Diagnose why OVH reports `runtimeOk: false` / `liveAgents: []`
2. Either restore a real health signal **or** document+wire the correct health probe for how agents actually run post ADR-024
3. Give operators a clear recovery path from the banner

## Known facts (2026-07-29 QA)

- Home overview calls `paseo ls --json` via `getLiveAgents()` in `src/app/api/home/overview/route.ts`.
- On OVH (`ovhvps`): **`paseo: command not found`** → every probe fails → permanent agentsDown.
- Durable work runs + pi execution hosting were redesigned (ADR-023/024); health may need to check **work-run workers / pi binary / CHANNEL_PI_BIN**, not only paseo.
- Channel `@pi` / Stage advance still attempt to run agents; a red banner without a fix path is worse than silence.

---

## ⚠️ CRITICAL GOTCHAS

1. **Do not install random globals on OVH without Ben.** Propose the install/path; ask before `npm i -g` / copying binaries / opening firewall.
2. Production binds loopback; Tailscale is the edge — see `openwiki/deployment/ovh-production.md` / `AGENTS.md`.
3. Dirty deploys are discouraged.
4. Health checks must be **fast** (<2s) and fail soft — never hang overview.
5. Prefer reading ADR-024 before changing execution host assumptions.

---

## Settled decisions

| Topic | Choice |
|---|---|
| Banner stays | Keep agents-down banner; improve accuracy + CTA |
| Probe strategy | Multi-signal: (A) execution binary present, (B) optional paseo if used, (C) recent work_run heartbeats |
| `agentsDown` meaning | `true` only if **no viable execution path** for channel agents |
| Secrets | Never log API keys; reuse existing model status routes |

---

## PHASE 0 — Diagnose on OVH (read-only)

SSH `ovhvps` and record:

```bash
which paseo pi node; type paseo pi 2>&1
echo "CHANNEL_PI_BIN=${CHANNEL_PI_BIN:-unset}"
# from activity-dashboard service env if present:
systemctl show activity-dashboard -p Environment 2>/dev/null | tr ' ' '\n' | rg -i 'PI|PASEO|PATH|CHANNEL' || true
ls -la $(command -v pi 2>/dev/null) 2>/dev/null
# recent work runs
# (via psql/node against activity_log — use pool pattern / existing scripts)
```

Write findings into `dashboard/findings-agent-runtime.md` (create): what exists, what Home checks, gap.

**Commit:** `docs: agent runtime health findings on OVH`

---

## PHASE 1 — Redesign health probe (code)

### Update `getLiveAgents()` (or replace with `getAgentRuntimeHealth()`)

Return shape (extend carefully; keep Home compatible):

```ts
{
  runtimeOk: boolean;
  runtimeError: string | null;
  liveAgents: Array<{...}>; // may be empty even when runtimeOk if no sessions
  signals: {
    paseo: "ok" | "missing" | "error";
    piBin: "ok" | "missing" | "error";
    workRuns: "ok" | "stale" | "none" | "error";
  };
  recoveryHint: string; // shown on Home
}
```

Logic (settle in code comments):

1. Resolve pi bin: `process.env.CHANNEL_PI_BIN || "pi"` — check `which`/fs exists.
2. Try paseo ls — if missing, signal `paseo: missing` but **do not alone force runtimeOk false** if piBin ok and work-run worker path is intended.
3. Query `work_runs` for any `running` with fresh `heartbeat_at` (e.g. < 2 min) OR any `succeeded` in last 24h as “pipeline alive” soft signal.
4. `runtimeOk = piBin === "ok"` for v1 on OVH **or** (paseo ok) if that remains the control plane — **choose based on Phase 0 findings**. Document the choice in findings.

### Home banner

Show `recoveryHint` + link:

- If pi missing: link to Ops/Models or a short `/ops/config` runbook section
- If paseo missing but pi ok: banner should **not** scream DOWN; use neutral “No live Paseo sessions” if needed

### Verify
`curl` `/api/home/overview` on OVH after deploy: `agentsDown` matches reality; `recoveryHint` non-empty when down.

**Commit:** `fix(home): multi-signal agent runtime health probe`

---

## PHASE 2 — Minimal restore path (only with Ben approval)

Based on Phase 0, implement **one** of:

**A.** Install/configure `paseo` on OVH if it is still the intended session manager  
**B.** Point systemd `PATH` / `CHANNEL_PI_BIN` at the real pi binary and prove `pi -p` works for a dry run  
**C.** If Mac worker is the real executor: change health to “OVH control plane OK / worker last seen …” and document Mac feeder requirement

Do **not** pursue A+B+C. One path. Ask Ben with the findings file before changing the VPS.

### Verify
StageActionBar **Run agent & advance** or `@pi` on a scratch thread produces a work_run or agent reply; Home not falsely red.

**Commit:** ops + code as needed; message describes the chosen path.

---

## PHASE 3 — QA + runbook

1. Update `openwiki/deployment/ovh-production.md` or `AGENTS.md` with “Agent health” subsection: what Home checks, how to recover.
2. Manual QA: Home banner, Models page, one channel mention.

**Commit:** `docs: OVH agent health runbook`

---

## Out of scope

- Full Mac/OVH worker fleet redesign  
- Theme Lab / stage loop  
- Finance

---

## Checklist

```
[ ] PHASE 0 — diagnose OVH; write findings-agent-runtime.md
[ ]   commit
[ ] PHASE 1 — multi-signal health + Home hint
[ ]   commit
[ ] PHASE 2 — Ben-approved restore path only
[ ]   commit
[ ] PHASE 3 — runbook + QA
```
