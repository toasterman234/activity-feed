import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get("channelId")?.trim();
  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  try {
    const res = await pool.query(
      `SELECT
         thread_id,
         channel_id,
         lifecycle,
         state,
         enabled_workflows,
         template_version,
         stage_started_at,
         created_at,
         research_mode,
         priority,
         assignee,
         repo_id,
         labels,
         promoted_to,
         archived_at,
         updated_at
       FROM thread_meta
       WHERE channel_id = $1
         AND archived_at IS NULL`,
      [channelId],
    );
    return NextResponse.json({ rows: res.rows });
  } catch (err) {
    console.error("[channels/thread-meta] GET failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
