import { NextResponse } from "next/server";
import { execFileNoStdin } from "@/lib/execFileNoStdin";

export const dynamic = "force-dynamic";

type AgentHealthEntry = {
  id: string;
  name: string;
  host: "ovh" | "mac";
  runtime: string;
  status: "running" | "stopped" | "offline" | "error";
  detail: string; // one-line status text
  metricLabel: string;
  metricValue: string;
  alert: boolean;
};

type AgentHealthSnapshot = {
  agents: AgentHealthEntry[];
  alerts: string[];
  generated_at: string;
};

export async function GET() {
  const agents: AgentHealthEntry[] = [];
  const alerts: string[] = [];

  // 1. iii engine health (OVH)
  try {
    const { stdout: iiiOut } = await execFileNoStdin(
      "systemctl",
      ["show", "iii", "--property=ActiveState,MainPID,MemoryCurrent,ActiveEnterTimestamp", "--no-page"],
      { timeout: 5000, maxBuffer: 64 * 1024 },
    );
    const props: Record<string, string> = {};
    for (const line of iiiOut.trim().split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) props[line.slice(0, eq)] = line.slice(eq + 1);
    }
    const active = props.ActiveState === "active";
    const memBytes = Number(props.MemoryCurrent || "0");
    const memGb = memBytes / 1_073_741_824;
    const memPct = Math.round((memBytes / 5_368_709_120) * 100);

    if (active && memPct >= 80) {
      alerts.push(`iii memory pressure: ${memPct}% (${memGb.toFixed(1)}G / 5G)`);
    }
    if (!active) {
      alerts.push("iii engine is down");
    }

    agents.push({
      id: "iii-engine",
      name: "iii Engine",
      host: "ovh",
      runtime: "iii",
      status: active ? "running" : "offline",
      detail: active ? `PID ${props.MainPID}` : "systemd inactive",
      metricLabel: "Memory",
      metricValue: memPct >= 80 ? `${memGb.toFixed(1)}G ⚠️` : `${memGb.toFixed(1)}G`,
      alert: memPct >= 80 || !active,
    });
  } catch {
    agents.push({
      id: "iii-engine", name: "iii Engine", host: "ovh", runtime: "iii",
      status: "offline", detail: "query failed", metricLabel: "Memory", metricValue: "?",
      alert: true,
    });
    alerts.push("iii engine unreachable");
  }

  // 2. Buzz Desktop agents (Mac)
  try {
    const { stdout: buzzOut } = await execFileNoStdin(
      "ssh",
      [
        "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=no",
        "macmini", "python3",
        "/Users/bencharney/activity-feed/dashboard/scripts/buzz-agents-status.py",
      ],
      { timeout: 15000, maxBuffer: 256 * 1024 },
    );
    const data = JSON.parse(buzzOut.trim() || "{}");
    const buzzAgents = (data.agents || []).filter(
      (a: Record<string, unknown>) => a.is_active && a.pubkey,
    );

    for (const a of buzzAgents) {
      const running = a.running as boolean;
      const name = a.name as string;
      const runtime = a.runtime as string;
      const pid = a.pid as number | null;
      const exitCode = a.last_exit_code as number | null;
      const lastError = a.last_error as string | null;

      if (running && exitCode && exitCode !== 0) {
        alerts.push(`Buzz agent "${name}" exited with code ${exitCode}`);
      }
      if (running && lastError) {
        alerts.push(`Buzz agent "${name}" has error: ${lastError}`);
      }

      agents.push({
        id: `buzz:${a.pubkey}`,
        name,
        host: "mac",
        runtime,
        status: running ? "running" : "stopped",
        detail: running ? `PID ${pid}` : lastError || "stopped",
        metricLabel: "Runtime",
        metricValue: runtime || "?",
        alert: !!(running && (exitCode && exitCode !== 0 || lastError)),
      });
    }
  } catch (err) {
    agents.push({
      id: "buzz-error", name: "Buzz Agents", host: "mac", runtime: "?",
      status: "offline", detail: String(err).slice(0, 80), metricLabel: "?", metricValue: "?",
      alert: true,
    });
    alerts.push("Buzz agent query failed");
  }

  // 3. Paseo agents (runs locally on OVH)
  try {
    const { stdout: paseoOut } = await execFileNoStdin(
      "paseo", ["ls", "--json"],
      { timeout: 8000, maxBuffer: 2 * 1024 * 1024 },
    );
    const paseoAgents = JSON.parse(paseoOut || "[]");
    for (const a of Array.isArray(paseoAgents) ? paseoAgents : []) {
      const status = a.status || "unknown";
      agents.push({
        id: `paseo:${a.id || "unknown"}`,
        name: a.name || a.title || a.id || "agent",
        host: "ovh",
        runtime: "paseo/" + (a.provider || "?"),
        status: status === "connected" || status === "running" ? "running" : "offline",
        detail: `Paseo ${status}`,
        metricLabel: "CWD",
        metricValue: (a.cwd || "").split("/").pop() || "?",
        alert: status !== "connected" && status !== "running",
      });
    }
  } catch {
    // Paseo agents are optional — no alert
  }

  return NextResponse.json(
    { agents, alerts, generated_at: new Date().toISOString() } satisfies AgentHealthSnapshot,
    { headers: { "Cache-Control": "public, max-age=15" } },
  );
}
