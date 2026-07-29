import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";
import { requireIiiToken } from "@/lib/iii-auth";
import { getBind } from "@/lib/iii-binds";
import {
  errorBody,
  parseStatus,
  parseStringList,
  rowToTask,
  taskSelectSql,
  type ThreadPlanRow,
} from "@/lib/iii-tasks";

export const dynamic = "force-dynamic";

async function threadExists(threadId: string): Promise<boolean> {
  const res = await pool.query(`SELECT 1 FROM thread_meta WHERE thread_id = $1`, [threadId]);
  return res.rowCount !== null && res.rowCount > 0;
}

async function threadsForRepo(repoId: string): Promise<string[]> {
  const res = await pool.query(
    `SELECT thread_id FROM thread_meta WHERE repo_id = $1 ORDER BY updated_at DESC`,
    [repoId],
  );
  return res.rows.map((row) => String(row.thread_id));
}

async function resolveThreadId(opts: {
  threadId?: string;
  sessionId?: string;
}): Promise<{ threadId: string } | { error: ReturnType<typeof NextResponse.json> }> {
  const threadId = (opts.threadId || "").trim();
  const sessionId = (opts.sessionId || "").trim();
  if (threadId) {
    if (!(await threadExists(threadId))) {
      return { error: NextResponse.json(errorBody("thread not found", "not_found"), { status: 404 }) };
    }
    return { threadId };
  }
  if (sessionId) {
    const bind = await getBind(sessionId);
    if (!bind) {
      return {
        error: NextResponse.json(
          errorBody("session not bound; call POST /api/iii/bind with ensure_thread", "not_found"),
          { status: 404 },
        ),
      };
    }
    return { threadId: bind.thread_id };
  }
  return {
    error: NextResponse.json(
      errorBody("thread_id or session_id is required", "invalid"),
      { status: 400 },
    ),
  };
}

export async function GET(req: NextRequest) {
  const denied = requireIiiToken(req);
  if (denied) return denied;

  const url = req.nextUrl;
  const threadIdParam = url.searchParams.get("thread_id")?.trim() || "";
  const sessionId = url.searchParams.get("session_id")?.trim() || "";
  const repoId = url.searchParams.get("repo_id")?.trim() || "";
  const statusFilter = url.searchParams.get("status")?.trim() || "";
  const limitRaw = Number(url.searchParams.get("limit") || "100");
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 100;

  if (!threadIdParam && !sessionId && !repoId) {
    return NextResponse.json(
      errorBody("thread_id, session_id, or repo_id is required", "invalid"),
      { status: 400 },
    );
  }
  if (statusFilter && !parseStatus(statusFilter)) {
    return NextResponse.json(errorBody("status must be todo or done", "invalid"), { status: 400 });
  }

  let threadIds: string[] = [];
  if (threadIdParam || sessionId) {
    const resolved = await resolveThreadId({ threadId: threadIdParam, sessionId });
    if ("error" in resolved) return resolved.error;
    threadIds = [resolved.threadId];
  } else {
    threadIds = await threadsForRepo(repoId);
    if (threadIds.length === 0) {
      return NextResponse.json({ ok: true, tasks: [], thread_ids: [] });
    }
  }

  const params: unknown[] = [threadIds];
  let sql = `
    SELECT ${taskSelectSql("tp")}
      FROM thread_plans tp
     WHERE tp.thread_id = ANY($1::text[])
  `;
  if (statusFilter) {
    params.push(statusFilter);
    sql += ` AND tp.status = $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY tp.sort_order ASC, tp.created_at ASC LIMIT $${params.length}`;

  const res = await pool.query<ThreadPlanRow>(sql, params);
  return NextResponse.json({
    ok: true,
    tasks: res.rows.map(rowToTask),
    thread_ids: threadIds,
  });
}

export async function POST(req: NextRequest) {
  const denied = requireIiiToken(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(errorBody("invalid JSON body", "invalid"), { status: 400 });
  }

  const resolved = await resolveThreadId({
    threadId: String(body.thread_id || "").trim(),
    sessionId: String(body.session_id || "").trim(),
  });
  if ("error" in resolved) return resolved.error;
  const threadId = resolved.threadId;

  const externalId =
    body.external_id === undefined || body.external_id === null
      ? null
      : String(body.external_id).trim() || null;
  const explicitId = body.id === undefined || body.id === null ? null : String(body.id).trim() || null;

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

  const status =
    body.status === undefined ? undefined : parseStatus(body.status);
  if (body.status !== undefined && !status) {
    return NextResponse.json(errorBody("status must be todo or done", "invalid"), { status: 400 });
  }

  const title =
    body.title === undefined || body.title === null ? undefined : String(body.title).trim();
  if (title !== undefined && title.length < 1) {
    return NextResponse.json(errorBody("title must be non-empty", "invalid"), { status: 400 });
  }

  const stageId =
    body.stage_id === undefined
      ? undefined
      : body.stage_id === null
        ? null
        : String(body.stage_id).trim() || null;
  const assignee =
    body.assignee === undefined
      ? undefined
      : body.assignee === null
        ? null
        : String(body.assignee).trim() || null;
  const sortOrder =
    body.sort_order === undefined || body.sort_order === null
      ? undefined
      : Number(body.sort_order);

  if (sortOrder !== undefined && (!Number.isFinite(sortOrder) || !Number.isInteger(sortOrder))) {
    return NextResponse.json(errorBody("sort_order must be an integer", "invalid"), { status: 400 });
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");

    let existing: ThreadPlanRow | null = null;
    if (explicitId) {
      const found = await db.query<ThreadPlanRow>(
        `SELECT ${taskSelectSql()} FROM thread_plans WHERE id = $1 AND thread_id = $2 FOR UPDATE`,
        [explicitId, threadId],
      );
      existing = found.rows[0] || null;
      if (!existing) {
        await db.query("ROLLBACK");
        return NextResponse.json(errorBody("task not found", "not_found"), { status: 404 });
      }
    } else if (externalId) {
      const found = await db.query<ThreadPlanRow>(
        `SELECT ${taskSelectSql()} FROM thread_plans WHERE thread_id = $1 AND external_id = $2 FOR UPDATE`,
        [threadId, externalId],
      );
      existing = found.rows[0] || null;
    }

    const now = new Date().toISOString();
    let created = false;
    let id: string;

    if (existing) {
      id = existing.id;
      const nextTitle = title ?? existing.title;
      const nextStatus = status ?? (parseStatus(existing.status) || "todo");
      const nextSort = sortOrder !== undefined ? sortOrder : Number(existing.sort_order) || 0;
      const nextStage = stageId === undefined ? existing.stage_id : stageId;
      const nextAssignee =
        assignee !== undefined ? assignee : existing.assignee !== null && existing.assignee !== "" ? existing.assignee : "iii";
      const nextAcceptance =
        acceptanceCriteria === undefined
          ? existing.acceptance_criteria
          : JSON.stringify(acceptanceCriteria);
      const nextDeps =
        dependencies === undefined ? existing.dependencies : JSON.stringify(dependencies);

      await db.query(
        `UPDATE thread_plans
            SET title = $2,
                status = $3,
                sort_order = $4,
                stage_id = $5,
                acceptance_criteria = $6,
                dependencies = $7,
                assignee = $8,
                external_id = COALESCE($9, external_id),
                updated_at = $10
          WHERE id = $1`,
        [
          id,
          nextTitle,
          nextStatus,
          nextSort,
          nextStage,
          typeof nextAcceptance === "string" ? nextAcceptance : JSON.stringify(nextAcceptance),
          typeof nextDeps === "string" ? nextDeps : JSON.stringify(nextDeps),
          nextAssignee,
          externalId,
          now,
        ],
      );
    } else {
      if (!title) {
        await db.query("ROLLBACK");
        return NextResponse.json(errorBody("title is required on create", "invalid"), { status: 400 });
      }
      created = true;
      id = explicitId || randomUUID();

      let nextSort = sortOrder;
      if (nextSort === undefined) {
        const max = await db.query<{ max: number | null }>(
          `SELECT MAX(sort_order) AS max FROM thread_plans WHERE thread_id = $1`,
          [threadId],
        );
        nextSort = (max.rows[0]?.max ?? -1) + 1;
      }

      try {
        await db.query(
          `INSERT INTO thread_plans (
             id, thread_id, title, status, sort_order, stage_id,
             acceptance_criteria, dependencies, assignee, external_id,
             created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10,
             $11, $11
           )`,
          [
            id,
            threadId,
            title,
            status || "todo",
            nextSort,
            stageId === undefined ? null : stageId,
            JSON.stringify(acceptanceCriteria ?? []),
            JSON.stringify(dependencies ?? []),
            assignee === undefined ? "iii" : assignee,
            externalId,
            now,
          ],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/thread_plans_thread_external_uidx|unique/i.test(message)) {
          await db.query("ROLLBACK");
          return NextResponse.json(errorBody("external_id already exists on this thread", "conflict"), {
            status: 409,
          });
        }
        throw error;
      }
    }

    const out = await db.query<ThreadPlanRow>(
      `SELECT ${taskSelectSql()} FROM thread_plans WHERE id = $1`,
      [id],
    );
    await db.query("COMMIT");
    return NextResponse.json({ ok: true, task: rowToTask(out.rows[0]), created });
  } catch (error) {
    await db.query("ROLLBACK");
    return NextResponse.json(
      errorBody(error instanceof Error ? error.message : String(error), "invalid"),
      { status: 500 },
    );
  } finally {
    db.release();
  }
}
