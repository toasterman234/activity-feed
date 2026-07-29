import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../_db";
import { requireIiiToken } from "@/lib/iii-auth";
import {
  errorBody,
  parseStatus,
  parseStringList,
  rowToTask,
  taskSelectSql,
  type ThreadPlanRow,
} from "@/lib/iii-tasks";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = requireIiiToken(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  const taskId = String(id || "").trim();
  if (!taskId) {
    return NextResponse.json(errorBody("id is required", "invalid"), { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(errorBody("invalid JSON body", "invalid"), { status: 400 });
  }

  const keys = ["status", "title", "sort_order", "assignee", "acceptance_criteria", "dependencies", "stage_id"];
  if (!keys.some((key) => body[key] !== undefined)) {
    return NextResponse.json(errorBody("at least one updatable field is required", "invalid"), {
      status: 400,
    });
  }

  let acceptanceCriteria: string[] | undefined;
  let dependencies: string[] | undefined;
  try {
    acceptanceCriteria = parseStringList(body.acceptance_criteria, "acceptance_criteria");
    dependencies = parseStringList(body.dependencies, "dependencies");
  } catch (error) {
    return NextResponse.json(
      errorBody(error instanceof Error ? error.message : String(error), "invalid"),
      { status: 400 },
    );
  }

  const status = body.status === undefined ? undefined : parseStatus(body.status);
  if (body.status !== undefined && !status) {
    return NextResponse.json(errorBody("status must be todo or done", "invalid"), { status: 400 });
  }

  const title =
    body.title === undefined || body.title === null ? undefined : String(body.title).trim();
  if (title !== undefined && title.length < 1) {
    return NextResponse.json(errorBody("title must be non-empty", "invalid"), { status: 400 });
  }

  const sortOrder =
    body.sort_order === undefined || body.sort_order === null
      ? undefined
      : Number(body.sort_order);
  if (sortOrder !== undefined && (!Number.isFinite(sortOrder) || !Number.isInteger(sortOrder))) {
    return NextResponse.json(errorBody("sort_order must be an integer", "invalid"), { status: 400 });
  }

  const assignee =
    body.assignee === undefined
      ? undefined
      : body.assignee === null
        ? null
        : String(body.assignee).trim() || null;
  const stageId =
    body.stage_id === undefined
      ? undefined
      : body.stage_id === null
        ? null
        : String(body.stage_id).trim() || null;

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (sqlFrag: string, value: unknown) => {
    params.push(value);
    sets.push(`${sqlFrag} = $${params.length}`);
  };

  if (status !== undefined) push("status", status);
  if (title !== undefined) push("title", title);
  if (sortOrder !== undefined) push("sort_order", sortOrder);
  if (assignee !== undefined) push("assignee", assignee);
  if (stageId !== undefined) push("stage_id", stageId);
  if (acceptanceCriteria !== undefined) push("acceptance_criteria", JSON.stringify(acceptanceCriteria));
  if (dependencies !== undefined) push("dependencies", JSON.stringify(dependencies));

  params.push(new Date().toISOString());
  sets.push(`updated_at = $${params.length}`);
  params.push(taskId);

  const res = await pool.query<ThreadPlanRow>(
    `UPDATE thread_plans
        SET ${sets.join(", ")}
      WHERE id = $${params.length}
      RETURNING ${taskSelectSql()}`,
    params,
  );

  if (!res.rows[0]) {
    return NextResponse.json(errorBody("task not found", "not_found"), { status: 404 });
  }

  return NextResponse.json({ ok: true, task: rowToTask(res.rows[0]) });
}
