import { NextResponse } from "next/server";
import { dispatchJob, NOMAD_DISPATCH_ALLOWLIST } from "@/lib/nomad";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { jobName, payload } = (await request.json().catch(() => ({}))) as {
      jobName?: string;
      payload?: string;
    };

    if (!jobName || typeof jobName !== "string") {
      return NextResponse.json(
        { ok: false, message: "Missing jobName" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!NOMAD_DISPATCH_ALLOWLIST.includes(jobName)) {
      return NextResponse.json(
        { ok: false, message: `Job "${jobName}" is not on the dispatch allowlist` },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await dispatchJob(jobName, payload);
    const status = result.ok ? 200 : 502;
    return NextResponse.json(result, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
