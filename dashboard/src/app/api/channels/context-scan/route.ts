import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";
import { execFileNoStdin } from "@/lib/execFileNoStdin";
import { transitionThreadState } from "@/app/channels/transitionThread";
import { resolveThreadStageModule } from "@/app/channels/workflowRuntime";

export const dynamic = "force-dynamic";

type Candidate = {
  source: string;
  sourceRef: string;
  excerpt: string;
  relevance: string;
  confidence?: number;
  sensitivity?: string;
};

function queryTerms(query: string) {
  const stop = new Set(["about", "after", "also", "and", "are", "for", "from", "have", "how", "that", "the", "this", "want", "what", "when", "which", "with"]);
  return [...new Set((query.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || [])
    .filter((term) => !stop.has(term)))].slice(0, 10);
}

async function searchDatabase(threadId: string, query: string): Promise<Candidate[]> {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const patterns = terms.map((term) => `%${term}%`);
  const [memory, decisions, observations, messages] = await Promise.all([
    pool.query(
      `SELECT text, category, created_at
         FROM graph_memory_items
        WHERE text ILIKE ANY($1::text[])
        ORDER BY created_at DESC LIMIT 12`,
      [patterns],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT statement, rationale, created_at
         FROM graph_decisions
        WHERE status = 'active'
          AND (statement ILIKE ANY($1::text[]) OR COALESCE(rationale, '') ILIKE ANY($1::text[]))
        ORDER BY created_at DESC LIMIT 10`,
      [patterns],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT text, category, created_at
         FROM graph_observations
        WHERE text ILIKE ANY($1::text[])
        ORDER BY created_at DESC LIMIT 12`,
      [patterns],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT m.id, m.thread_id, m.body, m.created_at, c.name AS channel_name
         FROM messages m
         JOIN channels c ON c.id = m.channel_id
        WHERE m.id <> $2
          AND COALESCE(m.thread_id, m.id) <> $2
          AND m.body ILIKE ANY($1::text[])
        ORDER BY m.created_at DESC LIMIT 18`,
      [patterns, threadId],
    ).catch(() => ({ rows: [] })),
  ]);

  return [
    ...memory.rows.map((row) => ({
      source: "accepted-memory",
      sourceRef: `Graph memory · ${row.category}`,
      excerpt: String(row.text).slice(0, 700),
      relevance: "Accepted memory matched the research question.",
      confidence: 0.86,
      sensitivity: "personal",
    })),
    ...decisions.rows.map((row) => ({
      source: "active-decision",
      sourceRef: "Graph Continuity decision",
      excerpt: `${row.statement}${row.rationale ? ` — ${row.rationale}` : ""}`.slice(0, 700),
      relevance: "An active decision may constrain or inform the research.",
      confidence: 0.9,
      sensitivity: "personal",
    })),
    ...observations.rows.map((row) => ({
      source: "observation",
      sourceRef: `Graph observation · ${row.category}`,
      excerpt: String(row.text).slice(0, 700),
      relevance: "A previous observation shares terms with the research question.",
      confidence: 0.68,
      sensitivity: "personal",
    })),
    ...messages.rows.map((row) => ({
      source: "previous-thread",
      sourceRef: `#${row.channel_name} · ${row.thread_id || row.id}`,
      excerpt: String(row.body).slice(0, 700),
      relevance: "A previous dashboard thread may contain related work or context.",
      confidence: 0.62,
      sensitivity: "personal",
    })),
  ];
}

async function searchMac(query: string): Promise<Candidate[]> {
  const encoded = Buffer.from(query, "utf8").toString("base64url");
  const script =
    process.env.CHANNEL_CONTEXT_SEARCH_SCRIPT ||
    "/Users/bencharney/activity-feed/feeders/context-search.py";
  const host = process.env.CHANNEL_CONTEXT_SEARCH_HOST || "bencharney@100.71.118.10";
  const result = await execFileNoStdin("/usr/bin/ssh", [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    host,
    "/usr/bin/python3",
    script,
    encoded,
  ], {
    timeout: 45_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const parsed = JSON.parse(result.stdout || "[]") as Candidate[];
  return parsed.filter((item) => item.sourceRef && item.excerpt).slice(0, 18);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { threadId, channelId, action, candidateId, status } = body as {
    threadId?: string;
    channelId?: string;
    action?: "scan" | "review" | "continue";
    candidateId?: string;
    status?: "included" | "ignored";
  };
  if (!threadId || !channelId || !action) {
    return NextResponse.json({ error: "threadId, channelId, and action required" }, { status: 400 });
  }

  const context = await resolveThreadStageModule(pool, {
    threadId,
    channelId,
    type: "context-scan",
  });
  if (!context) {
    return NextResponse.json({ error: "Context Scan is not configured for the current stage" }, { status: 409 });
  }
  const stageId = context.state;

  if (action === "review") {
    if (!candidateId || !status) {
      return NextResponse.json({ error: "candidateId and status required" }, { status: 400 });
    }
    await pool.query(
      `UPDATE thread_context_candidates
          SET status = $1
        WHERE id = $2 AND thread_id = $3`,
      [status, candidateId, threadId],
    );
    return NextResponse.json({ ok: true });
  }

  const approvedFrame = await pool.query(
    `SELECT payload
       FROM thread_stage_interactions
      WHERE thread_id = $1 AND stage_id = $2 AND kind = 'frame.proposal' AND status = 'approved'
      ORDER BY created_at DESC LIMIT 1`,
    [threadId, stageId],
  );
  if (!approvedFrame.rows[0]) {
    return NextResponse.json({ error: "Approve the research frame first" }, { status: 409 });
  }
  const frame = JSON.parse(String(approvedFrame.rows[0].payload || "{}")).frame;
  const query = [
    frame?.primaryQuestion,
    ...(frame?.subquestions || []),
    ...(frame?.scope || []),
  ].filter(Boolean).join("\n");

  if (action === "scan") {
    const scanId = randomUUID();
    const createdAt = new Date().toISOString();
    await pool.query(
      `INSERT INTO thread_context_scans
         (id, thread_id, stage_id, query, sources, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'running', $6)`,
      [scanId, threadId, stageId, query, JSON.stringify(context.module.config?.sources || []), createdAt],
    );
    try {
      const [databaseResults, macResults] = await Promise.all([
        searchDatabase(threadId, query),
        searchMac(query).catch((error) => [{
          source: "system",
          sourceRef: "Mac personal-context bridge",
          excerpt: `Personal file search was unavailable: ${(error as Error).message.slice(0, 300)}`,
          relevance: "Operational notice; do not include as research context.",
          confidence: 0,
          sensitivity: "system",
        }]),
      ]);
      const deduped = new Map<string, Candidate>();
      for (const item of [...databaseResults, ...macResults]) {
        const key = `${item.source}:${item.sourceRef}:${item.excerpt.slice(0, 80)}`;
        if (!deduped.has(key)) deduped.set(key, item);
      }
      for (const item of [...deduped.values()].slice(0, 30)) {
        await pool.query(
          `INSERT INTO thread_context_candidates
             (id, scan_id, thread_id, source, source_ref, excerpt, relevance,
              confidence, sensitivity, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)`,
          [
            randomUUID(), scanId, threadId, item.source, item.sourceRef,
            item.excerpt, item.relevance, item.confidence ?? null,
            item.sensitivity || "personal", createdAt,
          ],
        );
      }
      await pool.query(
        `UPDATE thread_context_scans SET status = 'completed', completed_at = $1 WHERE id = $2`,
        [new Date().toISOString(), scanId],
      );
      return NextResponse.json({ ok: true, scanId, candidateCount: deduped.size });
    } catch (error) {
      await pool.query(
        `UPDATE thread_context_scans SET status = 'error', completed_at = $1 WHERE id = $2`,
        [new Date().toISOString(), scanId],
      );
      throw error;
    }
  }

  const included = await pool.query(
    `SELECT source, source_ref, excerpt, relevance
       FROM thread_context_candidates
      WHERE thread_id = $1 AND status = 'included'
      ORDER BY created_at ASC`,
    [threadId],
  );
  let scan = await pool.query(
    `SELECT id FROM thread_context_scans
      WHERE thread_id = $1 AND status = 'completed'
      ORDER BY created_at DESC LIMIT 1`,
    [threadId],
  );
  if (!scan.rows[0]) {
    const skippedId = randomUUID();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO thread_context_scans
         (id, thread_id, stage_id, query, sources, status, created_at, completed_at)
       VALUES ($1, $2, $3, $4, '[]', 'completed', $5, $5)`,
      [skippedId, threadId, stageId, query, now],
    );
    scan = { rows: [{ id: skippedId }] } as typeof scan;
  }
  const markdown = [
    "# Approved personal context",
    "",
    included.rows.length
      ? "These excerpts were explicitly approved for use in this research."
      : "The Personal Context Scan was reviewed with no excerpts included.",
    "",
    ...included.rows.flatMap((row, index) => [
      `## ${index + 1}. ${row.source_ref}`,
      `Source: ${row.source}`,
      "",
      String(row.excerpt),
      "",
      `Relevance: ${row.relevance}`,
      "",
    ]),
  ].join("\n");
  await pool.query(
    `INSERT INTO thread_artifacts
       (id, thread_id, title, kind, content, version, stage_id, created_at)
     VALUES ($1, $2, 'Approved personal context', 'markdown', $3, 1, $4, $5)`,
    [randomUUID(), threadId, markdown, stageId, new Date().toISOString()],
  );
  await pool.query(
    `UPDATE thread_context_scans SET status = 'accepted' WHERE id = $1`,
    [scan.rows[0].id],
  );
  const transition = await transitionThreadState({
    threadId,
    channelId,
    toState: String(context.module.config?.continueTo || ""),
    actor: "you (approved context)",
    announce: true,
  });
  if (!transition.ok) {
    return NextResponse.json(transition, { status: transition.status });
  }
  return NextResponse.json({ ok: true, state: transition.to, included: included.rows.length });
}
