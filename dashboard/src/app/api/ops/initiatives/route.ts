import { NextRequest, NextResponse } from "next/server";
import {
  createInitiative,
  listInitiatives,
  syncInitiativesFromEvidenceMap,
} from "@/lib/graph-initiatives";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sync = req.nextUrl.searchParams.get("sync") === "1";
    let syncResult = null;
    if (sync) {
      syncResult = await syncInitiativesFromEvidenceMap("evidence-sync");
    }
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const initiatives = await listInitiatives(status ? { status } : undefined);
    return NextResponse.json({ initiatives, sync: syncResult });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    const initiative = await createInitiative({
      evidenceMapId: body.evidenceMapId || null,
      title,
      status: body.status || "open",
      channelId: body.channelId || null,
      threadId: body.threadId || null,
      planPath: body.planPath || null,
      createdBy: body.actor || "you",
    });
    return NextResponse.json({ initiative });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
