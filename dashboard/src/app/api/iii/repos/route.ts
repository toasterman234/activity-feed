import { NextRequest, NextResponse } from "next/server";
import { requireIiiToken } from "@/lib/iii-auth";
import { errorBody } from "@/lib/iii-tasks";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

/** GET /api/iii/repos — Activity Dashboard repos for Project World catalog sync. */
export async function GET(req: NextRequest) {
  const denied = requireIiiToken(req);
  if (denied) return denied;

  try {
    const res = await pool.query(
      `SELECT
         r.id, r.name, r.path, r.git_remote, r.created_at,
         COALESCE(plan.open_count, 0) AS open_task_count,
         COALESCE(plan.done_count, 0) AS done_task_count,
         COALESCE(plan.total_count, 0) AS task_count,
         COALESCE(th.thread_count, 0) AS thread_count
       FROM repos r
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE tp.status = 'todo') AS open_count,
           COUNT(*) FILTER (WHERE tp.status = 'done') AS done_count,
           COUNT(*) AS total_count
         FROM thread_plans tp
         JOIN thread_meta tm ON tm.thread_id = tp.thread_id
         WHERE tm.repo_id = r.id
       ) plan ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS thread_count
         FROM thread_meta tm
         WHERE tm.repo_id = r.id
       ) th ON true
       ORDER BY r.name ASC, r.created_at DESC`,
    );
    return NextResponse.json({
      ok: true,
      repos: res.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name || ""),
        path: row.path == null ? null : String(row.path),
        git_remote: row.git_remote == null || row.git_remote === "" ? null : String(row.git_remote),
        created_at: row.created_at == null ? null : String(row.created_at),
        open_task_count: Number(row.open_task_count) || 0,
        done_task_count: Number(row.done_task_count) || 0,
        task_count: Number(row.task_count) || 0,
        thread_count: Number(row.thread_count) || 0,
      })),
      count: res.rows.length,
    });
  } catch (error) {
    return NextResponse.json(
      errorBody(error instanceof Error ? error.message : String(error), "invalid"),
      { status: 500 },
    );
  }
}
