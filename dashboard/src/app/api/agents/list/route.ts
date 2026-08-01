import { NextResponse } from "next/server";
import { execFileNoStdin } from "@/lib/execFileNoStdin";

export const dynamic = "force-dynamic";

export async function GET() {
  const list: Array<{
    id: string;
    shortId: string;
    name: string;
    provider: string;
    status: string;
    cwd: string;
  }> = [];

  // Paseo agents
  try {
    const { stdout } = await execFileNoStdin("paseo", ["ls", "--json"], {
      timeout: 8000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const paseoAgents = JSON.parse(stdout || "[]");
    for (const a of Array.isArray(paseoAgents) ? paseoAgents : []) {
      list.push({
        id: String(a.id ?? ""),
        shortId: String(a.shortId ?? a.id ?? "").slice(0, 8),
        name: String(a.name ?? a.title ?? ""),
        provider: String(a.provider ?? ""),
        status: String(a.status ?? ""),
        cwd: String(a.cwd ?? ""),
      });
    }
  } catch (err) {
    console.error("[agents/list] paseo failed:", err);
  }

  // iii harness — check systemd status
  try {
    const { stdout } = await execFileNoStdin(
      "systemctl",
      ["show", "iii", "--property=ActiveState,SubState,MainPID", "--no-page"],
      { timeout: 3000, maxBuffer: 16 * 1024 },
    );
    const props: Record<string, string> = {};
    for (const line of stdout.trim().split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) props[line.slice(0, eq)] = line.slice(eq + 1);
    }
    const active = props.ActiveState === "active";
    list.push({
      id: "iii-harness",
      shortId: "iii",
      name: "iii",
      provider: "harness",
      status: active ? "connected" : "offline",
      cwd: "",
    });
  } catch {
    list.push({
      id: "iii-harness",
      shortId: "iii",
      name: "iii",
      provider: "harness",
      status: "unknown",
      cwd: "",
    });
  }

  return NextResponse.json({ agents: list });
}
