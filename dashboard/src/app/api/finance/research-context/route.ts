import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import type { FinanceResearchSnapshot } from "@/lib/finance-research";
import { pool } from "../../_db";
import { publicationToContext, type FinancePublication } from "@/lib/finance-publication";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const snapshot = JSON.parse(
      await readFile(path.join(process.cwd(), "data/finance-research.snapshot.json"), "utf8"),
    ) as FinanceResearchSnapshot;
    const artifactRows = await pool.query(
      `SELECT DISTINCT ON ((content::jsonb->>'publicationKey'))
          id, thread_id, version, content, tm.channel_id
         FROM thread_artifacts ta
         JOIN thread_meta tm ON tm.thread_id = ta.thread_id
        WHERE ta.kind = 'finance_publication'
        ORDER BY (content::jsonb->>'publicationKey'), version DESC, ta.created_at DESC`,
    ).then((result) => result.rows).catch(() => []);
    const published = artifactRows.flatMap((row) => {
      try {
        const publication = JSON.parse(row.content) as FinancePublication;
        return publication.status === "revoked"
          ? []
          : [publicationToContext(publication, {
              channelId: row.channel_id,
              threadId: row.thread_id,
              artifactId: row.id,
              version: row.version,
            })];
      } catch {
        return [];
      }
    });
    const allContexts = [...snapshot.contexts, ...published];
    const threadIds = [...new Set(allContexts.map((context) => context.source.threadId).filter(Boolean))];
    const [decisions, memory] = threadIds.length
      ? await Promise.all([
          pool.query(
            `SELECT id, thread_id, statement, rationale
               FROM graph_decisions
              WHERE thread_id = ANY($1::text[]) AND status = 'active'
              ORDER BY created_at DESC`,
            [threadIds],
          ).then((result) => result.rows).catch(() => []),
          pool.query(
            `SELECT id, thread_id, text, category
               FROM graph_memory_items
              WHERE thread_id = ANY($1::text[])
              ORDER BY created_at DESC`,
            [threadIds],
          ).then((result) => result.rows).catch(() => []),
        ])
      : [[], []];
    const contextsWithGraph = allContexts.map((context) => ({
      ...context,
      graphContext: {
        activeDecisions: decisions
          .filter((row) => row.thread_id === context.source.threadId)
          .map(({ id, statement, rationale }) => ({ id, statement, rationale })),
        acceptedMemory: memory
          .filter((row) => row.thread_id === context.source.threadId)
          .map(({ id, text, category }) => ({ id, text, category })),
      },
    }));
    const symbols = new Set(
      (request.nextUrl.searchParams.get("symbols") ?? "")
        .split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
    );
    const contexts = symbols.size
      ? contextsWithGraph.filter((context) =>
          context.symbols.length === 0 || context.symbols.some((symbol) => symbols.has(symbol)))
      : contextsWithGraph;
    return NextResponse.json({ ...snapshot, contexts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Research snapshot unavailable" },
      { status: 503 },
    );
  }
}
