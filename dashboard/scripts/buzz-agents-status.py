#!/usr/bin/env python3
import json, os, glob

agents_path = os.path.expanduser(
    "~/Library/Application Support/xyz.block.buzz.app/agents/managed-agents.json"
)
with open(agents_path) as f:
    agents = json.load(f)

pids = {}
pid_dir = os.path.expanduser(
    "~/Library/Application Support/xyz.block.buzz.app/agents/agent-pids"
)
for pf in glob.glob(pid_dir + "/*.json"):
    try:
        with open(pf) as f:
            d = json.load(f)
            pk = d.get("key", {}).get("pubkey", "")
            if pk:
                pids[pk] = {"pid": d.get("pid"), "startedAt": d.get("startedAt")}
    except Exception:
        pass

result = []
for a in agents:
    pk = a.get("pubkey", "")
    pi = pids.get(pk, {})
    result.append({
        "pubkey": pk,
        "name": a.get("name", ""),
        "runtime": a.get("runtime", a.get("agent_command", "")),
        "provider": a.get("provider"),
        "model": a.get("model"),
        "is_active": a.get("is_active", False),
        "running": pk in pids,
        "pid": pi.get("pid"),
        "started_at": pi.get("startedAt"),
        "last_stopped_at": a.get("last_stopped_at"),
        "last_exit_code": a.get("last_exit_code"),
        "last_error": a.get("last_error"),
        "start_on_app_launch": a.get("start_on_app_launch", False),
        "relay_url": a.get("relay_url", ""),
    })

print(json.dumps({
    "agents": result,
    "running": len([r for r in result if r["running"]]),
    "total": len(result),
}))
