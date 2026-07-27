import { NextRequest, NextResponse } from "next/server";
import { pool } from "../_db";
import {
  getWorkRun,
  interruptExpiredWorkRuns,
  listThreadWorkRuns,
  requestWorkRunCancellation,
  retryWorkRun,
} from "@/lib/work-runs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId")?.trim();
  if (!threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  const requestedLimit = Number(req.nextUrl.searchParams.get("limit") || 20);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 20;

  try {
    const recovered = await interruptExpiredWorkRuns(pool);
    const runs = await listThreadWorkRuns(pool, threadId, limit);
    const checks = runs.length
      ? await pool.query(
          `SELECT id, run_id, check_key, label, required, status, exit_code,
                  output_excerpt, started_at, completed_at
             FROM work_run_checks
            WHERE run_id = ANY($1::text[])
            ORDER BY started_at ASC`,
          [runs.map((run) => run.id)],
        ).then((result) => result.rows).catch(() => [])
      : [];
    return NextResponse.json({
      runs,
      checks,
      recovered: recovered.filter((run) => run.thread_id === threadId).map((run) => run.id),
    });
  } catch (error) {
    console.error("[work-runs] list failed:", error);
    return NextResponse.json({ error: "Could not load work runs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { action?: string; runId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const runId = body.runId?.trim();
  if (!runId) {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }

  try {
    const existing = await getWorkRun(pool, runId);
    if (!existing) {
      return NextResponse.json({ error: "Work run not found" }, { status: 404 });
    }

    if (body.action === "cancel") {
      const run = await requestWorkRunCancellation(pool, runId);
      if (!run) {
        return NextResponse.json(
          { error: `A ${existing.status} run cannot be cancelled` },
          { status: 409 },
        );
      }
      const text = String(run.request_payload.text || "").trim();
      const rootId = String(run.request_payload.rootId || run.thread_id).trim();
      const handle = String(run.request_payload.handle || "").replace(/^@/, "").trim();
      if (!text || !rootId || !handle) {
        await requestWorkRunCancellation(pool, run.id);
        return NextResponse.json(
          { error: "This older attempt does not contain enough context for an automatic retry" },
          { status: 409 },
        );
      }
      const triggerResponse = await fetch(new URL("/api/channels/trigger", req.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channelId: run.channel_id,
          threadId: rootId,
          text,
          mentions: [handle],
          workRunId: run.id,
        }),
      });
      if (!triggerResponse.ok) {
        const failure = await triggerResponse.json().catch(() => ({}));
        await requestWorkRunCancellation(pool, run.id);
        return NextResponse.json(
          { error: failure.error || "The retry could not be dispatched" },
          { status: 502 },
        );
      }
      return NextResponse.json({ run, dispatched: true });
    }

    if (body.action === "retry") {
      const run = await retryWorkRun(pool, runId);
      if (!run) {
        return NextResponse.json(
          { error: "This attempt is not retryable or the retry already exists" },
          { status: 409 },
        );
      }
      return NextResponse.json({ run });
    }

    return NextResponse.json({ error: "action must be cancel or retry" }, { status: 400 });
  } catch (error) {
    console.error("[work-runs] action failed:", error);
    return NextResponse.json({ error: "Could not update work run" }, { status: 500 });
  }
}
