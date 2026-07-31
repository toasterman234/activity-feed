import { NextRequest, NextResponse } from "next/server";
import { buildFleetSnapshot } from "@/lib/fleet-server";
import { FLEET_HOSTS, hostById, safeCommandForHost, type FleetActionId, type FleetHostId } from "@/lib/fleet";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = new Set<FleetActionId>(["inspect", "open-session", "open-shell", "open-paseo", "open-cronicle", "stop-container", "restart-container", "remove-container", "pool-command"]);

const FLEET_METRICS_URL = process.env.FLEET_METRICS_URL || "http://100.71.118.10:18190";

type FleetActionRequest = {
  hostId?: FleetHostId;
  action?: FleetActionId;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as FleetActionRequest;
    const hostId = body.hostId;
    const action = body.action;

    if (!hostId || !hostById(FLEET_HOSTS, hostId)) {
      return NextResponse.json({ ok: false, error: "missing or unknown hostId" }, { status: 400 });
    }
    if (!action) {
      return NextResponse.json({ ok: false, error: "missing action" }, { status: 400 });
    }
    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
    }

    // Container management actions — forward to the telemetry bridge
    if (action === "stop-container" || action === "restart-container" || action === "remove-container") {
      const containerName = (body as Record<string, unknown>).name as string | undefined;
      if (!containerName) {
        return NextResponse.json({ ok: false, error: "missing container name" }, { status: 400 });
      }
      const bridgeAction = action === "stop-container" ? "stop" : action === "restart-container" ? "restart" : "remove";
      const res = await fetch(`${FLEET_METRICS_URL}/zima/container/${bridgeAction}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: containerName }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return NextResponse.json({ ok: false, error: data.error || `HTTP ${res.status}` }, { status: 502 });
      }
      return NextResponse.json(data);
    }

    // pool-command: ad-hoc command execution via Dagu
    if (action === "pool-command") {
      const cmd = (body as Record<string, unknown>).command as string | undefined;
      if (!cmd) {
        return NextResponse.json({ ok: false, error: "missing command" }, { status: 400 });
      }
      const { execSync } = await import("child_process");
      const { randomUUID } = await import("crypto");
      const fs = await import("fs/promises");
      const path = await import("path");

      // Read Mac health from bridge
      let macHealth = "unknown";
      try {
        const hr = await fetch(`${FLEET_METRICS_URL}/mac/pool-health`, { signal: AbortSignal.timeout(5000) });
        if (hr.ok) {
          const hd = await hr.json() as { status?: string };
          macHealth = hd.status || "unknown";
        }
      } catch { /* bridge unreachable — assume overloaded */ }

      // Select worker_selector
      const forceMac = (body as Record<string, unknown>).local === true;
      const forceOverflow = (body as Record<string, unknown>).heavy === true;
      let selector: string;
      if (forceMac) {
        selector = "  device: mac";
      } else if (forceOverflow || macHealth !== "healthy") {
        selector = "  pool_type: overflow";
      } else {
        selector = "  device: mac";
      }

      const name = `adhoc-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
      const dagsDir = process.env.DAGU_DAGS_DIR || "/home/ubuntu/.config/dagu/dags";
      const dagPath = path.join(dagsDir, `${name}.yaml`);

      // Base64-encode command to avoid quoting issues
      const cmdB64 = Buffer.from(cmd).toString("base64");
      const repo = (body as Record<string, unknown>).repo as string | undefined;
      
      // Build steps: optional git clone preamble, then the command
      const steps: string[] = [];
      const workdir = repo ? "$HOME/pool-work" : undefined;
      
      if (repo && workdir) {
        // Bootstrap: clone repo if needed, pull if exists
        steps.push(
          `  - id: bootstrap`,
          `    run: |`,
          `      if [ -d ${workdir}/.git ]; then`,
          `        cd ${workdir} && git pull --ff-only 2>/dev/null || true`,
          `      else`,
          `        git clone ${repo} ${workdir}`,
          `      fi`,
          `      cd ${workdir} && python3 -m pip install -r requirements.txt --quiet 2>/dev/null || true`,
        );
      }
      
      steps.push(
        `  - id: run`,
        `    run: cd ${workdir || "$HOME"} && echo ${cmdB64} | base64 -d | sh`,
      );
      
      const yaml = [
        `name: ${name}`,
        "description: fleet ad-hoc command",
        "type: graph",
        "queue: background",
        "worker_selector:",
        selector,
        "steps:",
        ...steps,
        "",
      ].join("\n");

      await fs.writeFile(dagPath, yaml);

      // Enqueue
      const { execSync: exec } = await import("child_process");
      let runId = "";
      try {
        const enq = exec(`dagu enqueue ${dagPath} 2>&1`, { encoding: "utf-8", timeout: 10_000 });
        const m = enq.match(/run-id=([^\s]+)/);
        runId = m ? m[1] : "";
      } catch (e) {
        return NextResponse.json({ ok: false, error: `enqueue failed: ${e}` }, { status: 502 });
      }

      // Cleanup after a delay (async, don't block response)
      setTimeout(() => {
        try { exec(`rm -f ${dagPath}`); } catch { /* best effort */ }
      }, 120_000);

      return NextResponse.json({
        ok: true,
        kind: "pool-command",
        hostId: "ovh",
        action,
        dag: name,
        runId,
        workerSelector: forceMac ? "mac" : forceOverflow ? "overflow" : macHealth === "healthy" ? "mac" : "overflow",
        message: `Submitted. ${forceMac ? "Pinned to Mac." : forceOverflow ? "Routed to overflow." : macHealth === "healthy" ? "Mac preferred (healthy)." : "Mac overloaded — routed to overflow."}`,
        command: cmd,
      });
    }

    const command = safeCommandForHost(hostId, action);
    if (command.kind === "inspect") {
      const snapshot = await buildFleetSnapshot();
      const host = snapshot.hosts.find((item) => item.id === hostId) || null;
      return NextResponse.json({
        ok: true,
        kind: "snapshot",
        hostId,
        action,
        message: `Refreshed ${host?.name || hostId}.`,
        host,
        snapshot,
      });
    }

    return NextResponse.json({
      ok: true,
      kind: command.kind,
      hostId,
      action,
      message:
        command.kind === "url"
          ? `Open ${hostId} in a new tab.`
          : `Copy the command and run it where you want the session to land.`,
      value: command.value,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
