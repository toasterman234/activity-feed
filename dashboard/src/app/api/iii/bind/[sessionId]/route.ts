import { NextRequest, NextResponse } from "next/server";
import { requireIiiToken } from "@/lib/iii-auth";
import { errorBody } from "@/lib/iii-tasks";
import { getBind } from "@/lib/iii-binds";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = requireIiiToken(req);
  if (denied) return denied;

  const { sessionId: raw } = await ctx.params;
  const sessionId = decodeURIComponent(String(raw || "")).trim();
  if (!sessionId) {
    return NextResponse.json(errorBody("session_id is required", "invalid"), { status: 400 });
  }

  const bind = await getBind(sessionId);
  if (!bind) {
    return NextResponse.json(errorBody("bind not found", "not_found"), { status: 404 });
  }
  return NextResponse.json({ ok: true, bind });
}
