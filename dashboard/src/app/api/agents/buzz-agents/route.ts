import { NextResponse } from "next/server";
import { execFileNoStdin } from "@/lib/execFileNoStdin";

export const dynamic = "force-dynamic";

type BuzzAgentStatus = {
  pubkey: string;
  name: string;
  runtime: string;
  provider: string | null;
  model: string | null;
  is_active: boolean;
  running: boolean;
  pid: number | null;
  started_at: string | null;
  last_stopped_at: string | null;
  last_exit_code: number | null;
  last_error: string | null;
  start_on_app_launch: boolean;
  relay_url: string;
};

export async function GET() {
  try {
    // Read managed-agents.json and agent-pids/ from Mac via script
    const { stdout } = await execFileNoStdin(
      "ssh",
      [
        "-o", "ConnectTimeout=10",
        "-o", "StrictHostKeyChecking=no",
        "macmini",
        "python3",
        "/Users/bencharney/activity-feed/dashboard/scripts/buzz-agents-status.py",
      ],
      { timeout: 15000, maxBuffer: 256 * 1024 },
    );

    const data = JSON.parse(stdout.trim() || "{}");
    const agents: BuzzAgentStatus[] = data.agents || [];
    const running = data.running || 0;

    return NextResponse.json(
      {
        agents,
        running,
        total: data.total || agents.length,
        generated_at: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, max-age=30" } },
    );
  } catch (error) {
    console.error("[buzz-agents]", error);
    return NextResponse.json(
      {
        agents: [],
        running: 0,
        total: 0,
        generated_at: new Date().toISOString(),
        error: String(error),
      },
      { status: 200 },
    );
  }
}
