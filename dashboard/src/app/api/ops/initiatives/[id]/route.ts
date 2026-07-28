import { NextRequest, NextResponse } from "next/server";
import { getInitiativeDetail, setInitiativeStatus } from "@/lib/graph-initiatives";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const detail = await getInitiativeDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "initiative not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const actor = String(body.actor || "you");
    if (!body.status) {
      return NextResponse.json({ error: "status required" }, { status: 400 });
    }
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
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
