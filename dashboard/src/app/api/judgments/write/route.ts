import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";

// Direct Postgres writes for judgment_collections/judgments. Postgres is the
// source of truth for this deployment; electric-circuits replicates
// Postgres -> engine -> dashboard shapes one-way, so writes must land here
// directly instead of going through the electric-circuits client's write()
// (ds/changes), which never flows back into Postgres.

type CollectionRow = {
  id: string;
  name: string;
  kind: string;
  description: string;
  created_at: string;
};

type JudgmentRow = {
  id: string;
  activity_id: number;
  span_start: string;
  span_end: string;
  verdict: string;
  comment: string;
  collection_id: string;
  created_at: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { table, row, op, id } = body as {
    table: string;
    row?: CollectionRow | JudgmentRow;
    op?: "upsert" | "delete";
    id?: string;
  };

  try {
    if (op === "delete") {
      if (!id) return NextResponse.json({ error: "id required for delete" }, { status: 400 });
      if (table === "judgments") {
        await pool.query(`DELETE FROM judgments WHERE id = $1`, [id]);
      } else if (table === "judgment_collections") {
        await pool.query(`DELETE FROM judgments WHERE collection_id = $1`, [id]);
        await pool.query(`DELETE FROM judgment_collections WHERE id = $1`, [id]);
      } else {
        return NextResponse.json({ error: `unsupported table: ${table}` }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (!row) return NextResponse.json({ error: "row required" }, { status: 400 });

    if (table === "judgment_collections") {
      const r = row as CollectionRow;
      await pool.query(
        `INSERT INTO judgment_collections (id, name, kind, description, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [r.id, r.name, r.kind, r.description, r.created_at]
      );
    } else if (table === "judgments") {
      const r = row as JudgmentRow;
      await pool.query(
        `INSERT INTO judgments (id, activity_id, span_start, span_end, verdict, comment, collection_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET verdict = $5, comment = $6, collection_id = $7`,
        [r.id, r.activity_id, r.span_start, r.span_end, r.verdict, r.comment, r.collection_id, r.created_at]
      );
    } else {
      return NextResponse.json({ error: `unsupported table: ${table}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[judgments/write] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
