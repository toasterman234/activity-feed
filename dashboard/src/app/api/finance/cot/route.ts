import { NextResponse } from "next/server";
import { fetchCOT, type COTSnapshot } from "@/lib/cot";

export const dynamic = "force-dynamic";

let cached: { data: COTSnapshot; at: number } | null = null;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — COT is weekly

export async function GET() {
  try {
    if (cached && Date.now() - cached.at < TTL_MS) {
      return NextResponse.json(cached.data);
    }
    const snapshot = await fetchCOT();
    cached = { data: snapshot, at: Date.now() };
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "COT data unavailable" },
      { status: 503 },
    );
  }
}
