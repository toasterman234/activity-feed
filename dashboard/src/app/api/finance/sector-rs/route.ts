import { NextResponse } from "next/server";
import { computeSectorRS, type SectorRSSnapshot } from "@/lib/sector-rs";

export const dynamic = "force-dynamic";

let cached: { data: SectorRSSnapshot; at: number } | null = null;
const TTL_MS = 30 * 60 * 1000; // 30 minutes — Market Lake prices are EOD anyway

export async function GET() {
  try {
    if (cached && Date.now() - cached.at < TTL_MS) {
      return NextResponse.json(cached.data);
    }
    const snapshot = await computeSectorRS();
    cached = { data: snapshot, at: Date.now() };
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sector RS unavailable" },
      { status: 503 },
    );
  }
}
