import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";
import {
  FINANCE_PUBLICATION_KINDS,
  canPublishKind,
  normalizeSymbols,
  publicationStatus,
  type FinancePublication,
  type FinancePublicationKind,
} from "@/lib/finance-publication";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const input = await request.json() as Record<string, unknown>;
  const threadId = String(input.threadId ?? "");
  const action = input.action === "revoke" ? "revoke" : "publish";
  const kind = String(input.kind ?? "") as FinancePublicationKind;
  const publicationKey = String(input.publicationKey ?? `${threadId}:${kind}`);

  if (!threadId || !FINANCE_PUBLICATION_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Valid threadId and publication kind are required" }, { status: 422 });
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const thread = await db.query(
      `SELECT tm.channel_id, tm.state, tm.lifecycle, c.name AS channel_name
         FROM thread_meta tm
         JOIN channels c ON c.id = tm.channel_id
        WHERE tm.thread_id = $1
        FOR UPDATE`,
      [threadId],
    );
    if (!thread.rows[0] || thread.rows[0].lifecycle !== "research") {
      await db.query("ROLLBACK");
      return NextResponse.json({ error: "Only research lifecycle threads can publish to Finance" }, { status: 409 });
    }

    const previous = await db.query(
      `SELECT id, content, version
         FROM thread_artifacts
        WHERE thread_id = $1 AND kind = 'finance_publication'
        ORDER BY version DESC, created_at DESC`,
      [threadId],
    );
    const matching = previous.rows.find((row) => {
      try { return JSON.parse(row.content).publicationKey === publicationKey; } catch { return false; }
    });
    const prior = matching ? JSON.parse(matching.content) as FinancePublication : null;
    if (action === "revoke" && !prior) {
      await db.query("ROLLBACK");
      return NextResponse.json({ error: "Publication not found" }, { status: 404 });
    }
    if (action === "publish" && !canPublishKind(kind, thread.rows[0].state)) {
      await db.query("ROLLBACK");
      return NextResponse.json(
        { error: `${kind.replaceAll("_", " ")} requires an accepted research thread` },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const publication: FinancePublication = action === "revoke"
      ? { ...prior!, status: "revoked", revokedAt: now }
      : {
          schemaVersion: 1,
          publicationKey,
          kind,
          status: publicationStatus(thread.rows[0].state),
          title: String(input.title ?? "").trim(),
          symbols: normalizeSymbols(input.symbols),
          summary: String(input.summary ?? "").trim(),
          reasons: Array.isArray(input.reasons) ? input.reasons.map(String).filter(Boolean) : [],
          contradictions: Array.isArray(input.contradictions) ? input.contradictions.map(String).filter(Boolean) : [],
          blockingGaps: Array.isArray(input.blockingGaps) ? input.blockingGaps.map(String).filter(Boolean) : [],
          staleAfter: input.staleAfter ? String(input.staleAfter) : undefined,
          publishedAt: now,
        };
    if (!publication.title || !publication.summary) {
      await db.query("ROLLBACK");
      return NextResponse.json({ error: "Title and summary are required" }, { status: 422 });
    }

    const version = Number(matching?.version ?? 0) + 1;
    const artifactId = randomUUID();
    await db.query(
      `INSERT INTO thread_artifacts
        (id, thread_id, title, kind, content, version, stage_id, created_at)
       VALUES ($1, $2, $3, 'finance_publication', $4, $5, $6, $7)`,
      [artifactId, threadId, `Finance · ${publication.title}`, JSON.stringify(publication), version, thread.rows[0].state, now],
    );
    await db.query(
      `INSERT INTO graph_events
        (id, channel_id, thread_id, kind, actor, payload, caused_by, created_at)
       VALUES ($1, $2, $3, $4, 'human', $5, $6, $7)`,
      [
        randomUUID(),
        thread.rows[0].channel_id,
        threadId,
        action === "revoke" ? "finance.revoked" : matching ? "finance.revised" : "finance.published",
        JSON.stringify({
          artifactId,
          publicationKey,
          kind,
          version,
          symbols: publication.symbols,
          status: publication.status,
        }),
        matching?.id ?? null,
        now,
      ],
    );
    const relations = [
      ["finance.source_thread", artifactId, threadId],
      ...publication.symbols.map((symbol) => ["finance.symbol", artifactId, `symbol:${symbol}`]),
      ...(matching ? [["supersedes", artifactId, matching.id]] : []),
    ];
    for (const [type, sourceId, targetId] of relations) {
      await db.query(
        `INSERT INTO graph_relations (id, type, source_id, target_id, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), type, sourceId, targetId, now],
      );
    }
    await db.query("COMMIT");
    return NextResponse.json({ artifactId, version, publication }, { status: 201 });
  } catch (error) {
    await db.query("ROLLBACK");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publication failed" }, { status: 500 });
  } finally {
    db.release();
  }
}
