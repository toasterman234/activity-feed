import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const dag = request.nextUrl.searchParams.get("dag");
  const runId = request.nextUrl.searchParams.get("runId");

  if (!dag || !runId) {
    return NextResponse.json({ ok: false, error: "missing dag or runId" }, { status: 400 });
  }

  try {
    const logsDir = `/home/ubuntu/.config/dagu/logs/${dag}/${runId}`;
    let stdout = "";
    let stderr = "";
    let status = "pending";

    // Status
    try {
      const out = execSync(`dagu enqueue /home/ubuntu/.config/dagu/dags/${dag}.yaml 2>&1`, { encoding: "utf-8", timeout: 5000 });
    } catch { /* DAG file may already be cleaned up */ }

    try {
      const statusOut = execSync(`dagu status /home/ubuntu/.config/dagu/dags/${dag}.yaml 2>&1`, { encoding: "utf-8", timeout: 5000 });
      if (statusOut.includes("Succeeded")) status = "succeeded";
      else if (statusOut.includes("Failed")) status = "failed";
      else if (statusOut.includes("Running") || statusOut.includes("Started")) status = "running";
    } catch { /* may be cleaned up */ }

    // Output
    try {
      const files = execSync(`ls -t ${logsDir}/*/run.stdout.log 2>/dev/null | head -1`, { encoding: "utf-8", timeout: 5000 }).trim();
      if (files) stdout = readFileSync(files, "utf-8").trim();
    } catch { /* no output yet */ }

    try {
      const files = execSync(`ls -t ${logsDir}/*/run.stderr.log 2>/dev/null | head -1`, { encoding: "utf-8", timeout: 5000 }).trim();
      if (files) stderr = readFileSync(files, "utf-8").trim();
    } catch { /* no stderr */ }

    return NextResponse.json({
      ok: true,
      dag,
      runId,
      status,
      stdout,
      stderr: stderr || undefined,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
