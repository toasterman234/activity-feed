import { NextResponse } from "next/server";
import { getRiskAppetite, type RiskAppetiteSnapshot } from "@/lib/risk-regime";
import { computeSectorRS, type SectorRSSnapshot } from "@/lib/sector-rs";
import { fetchCOT, type COTSnapshot } from "@/lib/cot";

export const dynamic = "force-dynamic";

export interface MoneyFlowSnapshot {
  riskAppetite: RiskAppetiteSnapshot;
  sectorRotation: SectorRSSnapshot;
  cot?: COTSnapshot;
  asOf: string;
}

export async function GET() {
  try {
    const [riskAppetite, sectorRotation, cot] = await Promise.all([
      getRiskAppetite(),
      computeSectorRS(),
      fetchCOT().catch(() => null),
    ]);

    const snapshot: MoneyFlowSnapshot = {
      riskAppetite,
      sectorRotation,
      cot: cot ?? undefined,
      asOf: new Date().toISOString(),
    };

    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Money flow snapshot unavailable" },
      { status: 503 },
    );
  }
}
