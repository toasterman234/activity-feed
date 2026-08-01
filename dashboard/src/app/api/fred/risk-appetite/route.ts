import { NextResponse } from "next/server";
import { getRiskAppetite } from "@/lib/risk-regime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getRiskAppetite();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Risk appetite unavailable" },
      { status: 503 },
    );
  }
}
