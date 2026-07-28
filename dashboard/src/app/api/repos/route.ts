import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import path from "path";
import { pool } from "../_db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await pool.query(
      `SELECT
         r.id, r.name, r.path, r.git_remote, r.created_at,
         promo.thread_id AS source_thread_id,
         promo.channel_id AS source_channel_id,
         (promo.thread_id IS NOT NULL) AS from_promotion,
         COALESCE(stats.active_thread_count, 0) AS active_thread_count,
         COALESCE(stats.archived_thread_count, 0) AS archived_thread_count
       FROM repos r
       LEFT JOIN LATERAL (
         SELECT tm.thread_id, tm.channel_id
           FROM thread_meta tm
          WHERE tm.repo_id = r.id
            AND tm.promoted_to IS NOT NULL
          ORDER BY tm.updated_at DESC NULLS LAST, tm.thread_id DESC
          LIMIT 1
       ) promo ON true
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (
             WHERE tm.lifecycle = 'issue'
               AND tm.archived_at IS NULL
               AND tm.state NOT IN ('closed', 'wont_fix')
           ) AS active_thread_count,
           COUNT(*) FILTER (WHERE tm.archived_at IS NOT NULL) AS archived_thread_count
         FROM thread_meta tm
         WHERE tm.repo_id = r.id
       ) stats ON true
       ORDER BY r.created_at DESC, r.name ASC`,
    );
    return NextResponse.json({
      repos: res.rows.map((row) => ({
        ...row,
        exists_on_disk: existsSync(String(row.path)),
        scaffold_detected:
          existsSync(path.join(String(row.path), ".aiwg")) ||
          existsSync(path.join(String(row.path), "AIWG.md")),
      })),
    });
  } catch (err) {
    console.error("[repos] GET failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, path: repoPath, git_remote } = body as {
    name?: string;
    path?: string;
    git_remote?: string;
  };

  if (!name?.trim() || !repoPath?.trim()) {
    return NextResponse.json({ error: "name and path required" }, { status: 400 });
  }

  // Validate path is absolute
  if (!repoPath.startsWith("/")) {
    return NextResponse.json({ error: "path must be absolute" }, { status: 400 });
  }

  const id = randomUUID();
  const created_at = new Date().toISOString();

  try {
    await pool.query(
      `INSERT INTO repos (id, name, path, git_remote, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, name.trim(), repoPath, git_remote?.trim() || null, created_at],
    );

    const exists = existsSync(repoPath);
    return NextResponse.json({
      ok: true,
      repo: { id, name: name.trim(), path: repoPath, git_remote: git_remote?.trim() || null, created_at },
      warning: exists ? undefined : "path does not exist on this machine",
    });
  } catch (err) {
    console.error("[repos] POST failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { id } = body as { id?: string };

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    await pool.query(`DELETE FROM repos WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[repos] DELETE failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
