import { NextResponse } from "next/server";
import { fetchTududiGlance } from "../_queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tududiGlance = await fetchTududiGlance();
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      tududiGlance,
    });
  } catch (error) {
    console.error("[home/projects] failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
