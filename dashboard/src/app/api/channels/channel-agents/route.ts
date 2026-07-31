import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  try {
    const rows = await pool.query(
      `SELECT member_name, created_at
         FROM channel_members
        WHERE channel_id = $1 AND member_type = 'agent'
        ORDER BY member_name ASC`,
      [channelId],
    );
    return NextResponse.json({
      agents: rows.rows.map((r) => ({
        handle: r.member_name,
        addedAt: r.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list agents" },
      { status: 500 },
    );
  }
}
