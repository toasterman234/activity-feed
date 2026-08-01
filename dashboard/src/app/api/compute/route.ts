import { NextResponse } from "next/server";
import { buildComputeSnapshot } from "@/lib/nomad";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await buildComputeSnapshot();
    const status = snapshot.ok ? 200 : 503;
    return NextResponse.json(snapshot, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        generatedAt: new Date().toISOString(),
        nodes: [],
        jobs: [],
        allocations: [],
        error: error instanceof Error ? error.message : String(error),
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
