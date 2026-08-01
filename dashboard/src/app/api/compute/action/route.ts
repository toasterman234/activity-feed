import { NextResponse } from "next/server";
import { stopJob, restartAlloc, scaleJob, getAllocLogs } from "@/lib/nomad";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      jobName?: string;
      allocId?: string;
      task?: string;
      group?: string;
      count?: number;
    };

    switch (body.action) {
      case "stop": {
        if (!body.jobName) return NextResponse.json({ ok: false, message: "Missing jobName" }, { status: 400 });
        const r = await stopJob(body.jobName);
        return NextResponse.json(r, { status: r.ok ? 200 : 502 });
      }
      case "restart": {
        if (!body.allocId) return NextResponse.json({ ok: false, message: "Missing allocId" }, { status: 400 });
        const r = await restartAlloc(body.allocId);
        return NextResponse.json(r, { status: r.ok ? 200 : 502 });
      }
      case "scale": {
        if (!body.jobName || !body.group || body.count == null)
          return NextResponse.json({ ok: false, message: "Missing jobName, group, or count" }, { status: 400 });
        const r = await scaleJob(body.jobName, body.group, body.count);
        return NextResponse.json(r, { status: r.ok ? 200 : 502 });
      }
      case "logs": {
        if (!body.allocId || !body.task)
          return NextResponse.json({ ok: false, message: "Missing allocId or task" }, { status: 400 });
        const logs = await getAllocLogs(body.allocId, body.task);
        return NextResponse.json({ ok: true, logs }, { headers: { "Cache-Control": "no-store" } });
      }
      default:
        return NextResponse.json({ ok: false, message: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
