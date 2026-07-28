import { NextRequest, NextResponse } from "next/server";
import { transitionThreadState } from "@/app/channels/transitionThread";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    threadId,
    channelId,
    toState,
    actor,
  } = body as {
    threadId?: string;
    channelId?: string;
    toState?: string;
    actor?: string;
  };

  if (!threadId || !channelId || !toState) {
    return NextResponse.json(
      { error: "threadId, channelId, and toState required" },
      { status: 400 },
    );
  }

  const result = await transitionThreadState({
    threadId,
    channelId,
    toState,
    actor: actor || "you",
    announce: true,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }
  return NextResponse.json(result);
}
