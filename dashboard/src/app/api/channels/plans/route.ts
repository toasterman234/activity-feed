import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";

function stringList(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be a list of text values`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = String(body.action || "");
  const threadId = String(body.threadId || "");
  const stageId = String(body.stageId || "");
  if (!threadId || !stageId) return NextResponse.json({ error: "threadId and stageId are required" }, { status: 400 });

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const rows = await db.query(
      `SELECT id, sort_order FROM thread_plans WHERE thread_id = $1 AND (stage_id = $2 OR stage_id IS NULL) ORDER BY sort_order, created_at FOR UPDATE`,
      [threadId, stageId],
    );
    const ids = rows.rows.map((row) => String(row.id));

    if (action === "add") {
      const title = String(body.title || "").trim();
      if (title.length < 3) throw new Error("Enter a concrete task");
      await db.query(
        `INSERT INTO thread_plans (id, thread_id, title, status, sort_order, stage_id, acceptance_criteria, dependencies, created_at, updated_at)
         VALUES ($1, $2, $3, 'todo', $4, $5, '[]', '[]', now(), now())`,
        [randomUUID(), threadId, title, ids.length, stageId],
      );
    } else if (action === "update") {
      const title = String(body.title || "").trim();
      if (title.length < 3) throw new Error("Enter a concrete task");
      const acceptanceCriteria = stringList(body.acceptanceCriteria, "acceptanceCriteria");
      const dependencies = stringList(body.dependencies, "dependencies");
      await db.query(
        `UPDATE thread_plans
            SET title = $3,
                acceptance_criteria = COALESCE($4, acceptance_criteria),
                dependencies = COALESCE($5, dependencies),
                updated_at = now()
          WHERE id = $1 AND thread_id = $2`,
        [
          body.id,
          threadId,
          title,
          acceptanceCriteria === undefined ? null : JSON.stringify(acceptanceCriteria),
          dependencies === undefined ? null : JSON.stringify(dependencies),
        ],
      );
    } else if (action === "delete") {
      await db.query(`DELETE FROM thread_plans WHERE id = $1 AND thread_id = $2`, [body.id, threadId]);
    } else if (action === "move") {
      const index = ids.indexOf(String(body.id));
      const target = index + Number(body.direction || 0);
      if (index >= 0 && target >= 0 && target < ids.length) [ids[index], ids[target]] = [ids[target], ids[index]];
    } else {
      return NextResponse.json({ error: "Unknown plan action" }, { status: 400 });
    }

    const normalized = action === "delete"
      ? ids.filter((id) => id !== String(body.id))
      : action === "add"
        ? (await db.query(`SELECT id FROM thread_plans WHERE thread_id = $1 AND (stage_id = $2 OR stage_id IS NULL) ORDER BY sort_order, created_at`, [threadId, stageId])).rows.map((row) => String(row.id))
        : ids;
    for (const [index, id] of normalized.entries()) {
      await db.query(`UPDATE thread_plans SET sort_order = $2, stage_id = $3, updated_at = now() WHERE id = $1`, [id, index, stageId]);
    }
    await db.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await db.query("ROLLBACK");
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    db.release();
  }
}
