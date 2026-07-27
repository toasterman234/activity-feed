import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";
import { normalizeVerificationCommands, upsertVerificationProfile } from "@/lib/verification-profiles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const repoId = req.nextUrl.searchParams.get("repoId")?.trim();
  if (!repoId) {
    return NextResponse.json({ error: "repoId required" }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `SELECT p.repo_id, r.name AS repo_name, r.path AS repo_path,
              p.working_directory, p.commands, p.timeout_ms,
              p.max_feedback_cycles, p.enabled, p.updated_at
         FROM repos r
    LEFT JOIN repo_verification_profiles p ON p.repo_id = r.id
        WHERE r.id = $1`,
      [repoId],
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }
    return NextResponse.json({ profile: result.rows[0] });
  } catch (error) {
    console.error("[verification-profile] GET failed:", error);
    return NextResponse.json({ error: "Could not load verification profile" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let body: {
    repoId?: string;
    workingDirectory?: string | null;
    commands?: unknown;
    timeoutMs?: number;
    maxFeedbackCycles?: number;
    enabled?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.repoId?.trim()) {
    return NextResponse.json({ error: "repoId required" }, { status: 400 });
  }

  try {
    const commands = normalizeVerificationCommands(body.commands);
    const profile = await upsertVerificationProfile(pool, {
      repoId: body.repoId,
      workingDirectory: body.workingDirectory,
      commands,
      timeoutMs: body.timeoutMs,
      maxFeedbackCycles: body.maxFeedbackCycles,
      enabled: body.enabled,
    });
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save verification profile";
    const status = /commands|command|duplicate|invalid|required/.test(message) ? 400 : 500;
    console.error("[verification-profile] PUT failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
