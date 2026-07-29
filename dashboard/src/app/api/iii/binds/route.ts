import { NextRequest, NextResponse } from "next/server";
import { requireIiiToken } from "@/lib/iii-auth";
import { errorBody } from "@/lib/iii-tasks";
import { listBinds } from "@/lib/iii-binds";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireIiiToken(req);
  if (denied) return denied;

  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;

  try {
    const binds = await listBinds({ limit });
    return NextResponse.json({ ok: true, binds, count: binds.length });
  } catch (error) {
    return NextResponse.json(
      errorBody(error instanceof Error ? error.message : String(error), "invalid"),
      { status: 500 },
    );
  }
}
