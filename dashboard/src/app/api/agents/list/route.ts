import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { stdout } = await execFileAsync("paseo", ["ls", "--json"], {
      timeout: 8000,
      env: process.env,
      maxBuffer: 2 * 1024 * 1024,
    });
    const agents = JSON.parse(stdout || "[]");
    const list = (Array.isArray(agents) ? agents : []).map((a: Record<string, unknown>) => ({
      id: String(a.id ?? ""),
      shortId: String(a.shortId ?? a.id ?? "").slice(0, 8),
      name: String(a.name ?? a.title ?? ""),
      provider: String(a.provider ?? ""),
      status: String(a.status ?? ""),
      cwd: String(a.cwd ?? ""),
    }));

    // Virtual agent: iii harness (not a Paseo agent, but taggable in threads)
    list.push({
      id: "iii-harness",
      shortId: "iii",
      name: "iii",
      provider: "harness",
      status: "connected",
      cwd: "",
    });

    return NextResponse.json({ agents: list });
  } catch (err) {
    console.error("[agents/list]", err);
    return NextResponse.json({ agents: [], error: String(err) }, { status: 200 });
  }
}
