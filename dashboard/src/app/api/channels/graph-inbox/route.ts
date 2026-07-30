import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Continuity graph inbox retired — Tududi owns shared planning. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    retired: true,
    items: [],
    initiatives: [],
    message: "Graph continuity retired. Use Tududi + /projects.",
  });
}
