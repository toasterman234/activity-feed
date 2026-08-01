import { NextResponse } from "next/server";
import { execFileNoStdin } from "@/lib/execFileNoStdin";

export const dynamic = "force-dynamic";

type IiiHealth = {
  active: boolean;
  pid: number | null;
  uptime_seconds: number | null;
  memory_current_bytes: number;
  memory_high_bytes: number;
  memory_max_bytes: number;
  memory_pressure_pct: number;
  tasks: number;
  cpu_usage_seconds: number;
  active_sessions: number;
  errored_sessions: number;
  completed_sessions: number;
  quarantined_sessions: number;
  total_sessions: number;
  generated_at: string;
};

const MEMORY_HIGH = 5_368_709_120; // 5G (systemd MemoryHigh)
const MEMORY_MAX = 8_589_934_592; // 8G (systemd MemoryMax)

export async function GET() {
  try {
    const [systemctl, sessionsScript] = await Promise.all([
      execFileNoStdin(
        "systemctl",
        [
          "show", "iii",
          "--property=ActiveState,SubState,MainPID,MemoryCurrent,TasksCurrent,ActiveEnterTimestamp,CPUUsageNSec",
          "--no-page",
        ],
        { timeout: 5000, maxBuffer: 64 * 1024 },
      ),
      execFileNoStdin(
        "python3",
        [
          "-c",
          `import json, glob, os
results = {"active": 0, "errored": 0, "completed": 0, "quarantined": 0, "total": 0}
for f in sorted(glob.glob("/opt/iii/data/session-manager/console-*.jsonl")):
    if ".bak" in f: continue
    results["total"] += 1
    try:
        with open(f) as fh:
            lines = fh.readlines()
            if not lines: continue
            last = json.loads(lines[-1])
            status = last.get("meta", {}).get("status", "unknown") if last.get("type") == "meta" else "parse-error"
            if status in ("idle", "active"): results["active"] += 1
            elif status == "error": results["errored"] += 1
            elif status == "done": results["completed"] += 1
            elif status == "quarantined": results["quarantined"] += 1
    except: pass
print(json.dumps(results))`,
        ],
        { timeout: 5000, maxBuffer: 64 * 1024 },
      ),
    ]);

    const props: Record<string, string> = {};
    for (const line of systemctl.stdout.trim().split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) props[line.slice(0, eq)] = line.slice(eq + 1);
    }

    const active = props.ActiveState === "active";
    const pid = props.MainPID && props.MainPID !== "0" ? Number(props.MainPID) : null;
    const memory = Number(props.MemoryCurrent || "0");
    const tasks = Number(props.TasksCurrent || "0");
    const cpuNs = Number(props.CPUUsageNSec || "0");

    let uptimeSeconds: number | null = null;
    if (props.ActiveEnterTimestamp) {
      const entered = new Date(props.ActiveEnterTimestamp).getTime();
      if (!isNaN(entered)) uptimeSeconds = Math.floor((Date.now() - entered) / 1000);
    }

    const sessions = JSON.parse(sessionsScript.stdout.trim() || "{}");

    const health: IiiHealth = {
      active,
      pid,
      uptime_seconds: uptimeSeconds,
      memory_current_bytes: memory,
      memory_high_bytes: MEMORY_HIGH,
      memory_max_bytes: MEMORY_MAX,
      memory_pressure_pct: memory > 0 ? Math.round((memory / MEMORY_HIGH) * 100) : 0,
      tasks,
      cpu_usage_seconds: Math.round((cpuNs / 1_000_000_000) * 100) / 100,
      active_sessions: sessions.active || 0,
      errored_sessions: sessions.errored || 0,
      completed_sessions: sessions.completed || 0,
      quarantined_sessions: sessions.quarantined || 0,
      total_sessions: sessions.total || 0,
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json(health, { headers: { "Cache-Control": "public, max-age=15" } });
  } catch (error) {
    console.error("[iii-health]", error);
    return NextResponse.json(
      {
        active: false, pid: null, uptime_seconds: null,
        memory_current_bytes: 0, memory_high_bytes: MEMORY_HIGH, memory_max_bytes: MEMORY_MAX,
        memory_pressure_pct: 0, tasks: 0, cpu_usage_seconds: 0,
        active_sessions: 0, errored_sessions: 0, completed_sessions: 0,
        quarantined_sessions: 0, total_sessions: 0,
        generated_at: new Date().toISOString(), error: String(error),
      },
      { status: 200 },
    );
  }
}
