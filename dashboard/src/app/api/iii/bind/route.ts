import { NextRequest, NextResponse } from "next/server";
import { requireIiiToken } from "@/lib/iii-auth";
import { errorBody } from "@/lib/iii-tasks";
import { getBind, upsertBind } from "@/lib/iii-binds";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireIiiToken(req);
  if (denied) return denied;

  const sessionId = req.nextUrl.searchParams.get("session_id")?.trim() || "";
  if (!sessionId) {
    return NextResponse.json(errorBody("session_id is required", "invalid"), { status: 400 });
  }

  const bind = await getBind(sessionId);
  if (!bind) {
    return NextResponse.json(errorBody("bind not found", "not_found"), { status: 404 });
  }
  return NextResponse.json({ ok: true, bind });
}

export async function POST(req: NextRequest) {
  const denied = requireIiiToken(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(errorBody("invalid JSON body", "invalid"), { status: 400 });
  }

  const sessionId = String(body.session_id || "").trim();
  if (!sessionId) {
    return NextResponse.json(errorBody("session_id is required", "invalid"), { status: 400 });
  }

  try {
    const bind = await upsertBind({
      session_id: sessionId,
      thread_id: body.thread_id == null ? null : String(body.thread_id),
      channel_id: body.channel_id == null ? null : String(body.channel_id),
      repo_id: body.repo_id == null ? null : String(body.repo_id),
      title: body.title == null ? null : String(body.title),
      ensure_thread: body.ensure_thread === true,
    });
    return NextResponse.json({ ok: true, bind });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const message = error instanceof Error ? error.message : String(error);
    if (code === "not_found") {
      return NextResponse.json(errorBody(message, "not_found"), { status: 404 });
    }
    if (code === "invalid") {
      return NextResponse.json(errorBody(message, "invalid"), { status: 400 });
    }
    return NextResponse.json(errorBody(message, "invalid"), { status: 500 });
  }
}
