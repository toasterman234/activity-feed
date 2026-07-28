import { NextResponse } from "next/server";
import { buildFleetSnapshot } from "@/lib/fleet-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await buildFleetSnapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        generatedAt: new Date().toISOString(),
        hosts: [],
        summary: { healthy: 0, warn: 0, offline: 3 },
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
