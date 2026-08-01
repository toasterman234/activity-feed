import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FLEET_METRICS_URL = process.env.FLEET_METRICS_URL || "http://100.71.118.10:18190";

export async function GET() {
  try {
    const res = await fetch(`${FLEET_METRICS_URL}/mac/pool-health`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unknown", error: "bridge unreachable" });
  }
}
