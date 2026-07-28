import { NextRequest, NextResponse } from "next/server";
import { promoteInitiative, setInitiativeStatus } from "@/lib/graph-initiatives";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const actor = String(body.actor || "you");
    if (body.status && body.status !== "shipped") {
      const result = await setInitiativeStatus({
        id,
        status: body.status,
        actor,
        blockedBy: body.blockedBy || null,
      });
      if (!result.ok) {
        return NextResponse.json(result, { status: result.status });
      }
      return NextResponse.json(result);
    }
    const result = await promoteInitiative({
      id,
      actor,
      rationale: body.rationale || undefined,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
