import { NextRequest, NextResponse } from "next/server";

// ── fetch a full shape snapshot from the electric-circuits engine ─────

async function fetchShape(table: string): Promise<Record<string, unknown>[]> {
  const engineUrl = process.env.ELECTRIC_ENGINE_API || "http://127.0.0.1:8795";
  // Create a shape, read its stream (now a full snapshot since we created it fresh), then delete it.
  const createRes = await fetch(`${engineUrl}/shapes.create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table }),
  });
  if (!createRes.ok) {
    console.error(`[run-eval] failed to create shape for ${table}: ${createRes.status}`);
    return [];
  }
  const { result } = await createRes.json();
  const shape = result?.data;
  if (!shape?.streamUrl) return [];

  const dsBase = process.env.DS_BASE_URL || "http://127.0.0.1:8791";
  // The shape's streamUrl uses the Docker-internal hostname (ds:8791) —
  // replace it with the local proxy address reachable from the Next.js server.
  const streamPath = shape.streamUrl ? new URL(shape.streamUrl).pathname : `/shape/${shape.shapeId}`;
  const streamUrl = `${dsBase}${streamPath}?offset=-1`;
  console.log(`[run-eval] reading stream: ${streamUrl}`);
  const res = await fetch(streamUrl);
  console.log(`[run-eval] stream response: ${res.status} ${res.statusText}`);
  if (!res.ok) {
    console.error(`[run-eval] failed to read stream for ${table}: ${res.status}`);
    // Cleanup shape
    await fetch(`${engineUrl}/shapes.delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: shape.shapeId }),
    });
    return [];
  }

  const text = await res.text();
  const rows: Record<string, unknown>[] = [];
  // The engine returns either a JSON array (full snapshot) or NDJSON
  // (one envelope per line) depending on shape state — handle both.
  const envelopes: unknown[] = (() => {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return [];
      }
    }
    return trimmed
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  })();
  for (const env of envelopes as { headers?: { operation?: string }; value?: Record<string, unknown> }[]) {
    if (env?.headers?.operation === "upsert" && env.value) rows.push(env.value);
  }

  // Cleanup shape
  await fetch(`${engineUrl}/shapes.delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: shape.shapeId }),
  });

  return rows;
}

// ── types ──────────────────────────────────────────────────────────────

interface JudgmentRow {
  id: string;
  activity_id: number;
  verdict: string;
  comment: string;
  collection_id: string;
  created_at: string;
}
interface ActivityRow {
  id: string;
  source: string;
  summary: string;
  detail: string;
}

// ── POST /api/run-eval ─────────────────────────────────────────────────
//
// Body: { collection_id, collection_name, kind, run?: boolean }
// Returns: { exported, results?: { pass, fail, summary } }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { collection_id, collection_name, kind, run } = body;

    if (!collection_id) {
      return NextResponse.json({ error: "collection_id required" }, { status: 400 });
    }

    const judgments = (await fetchShape("judgments")) as JudgmentRow[];
    const bucket = collection_name || collection_id;
    const bucketJudgments = judgments.filter((j) => j.collection_id === collection_id);

    if (bucketJudgments.length === 0) {
      return NextResponse.json({
        exported: 0,
        jsonl: [],
        message: "No judgments in this collection",
      });
    }

    const result: {
      exported: number;
      jsonl: { id: string; input: string; output: string; verdict: string; comment: string; source_activity_id: number; bucket: string }[];
      results?: { pass: number; fail: number; summary: string };
    } = { exported: bucketJudgments.length, jsonl: [] };

    if (run && (kind === "eval" || kind === "regression")) {
      const activities = (await fetchShape("activity_log")) as ActivityRow[];
      const activityMap: Record<number, ActivityRow> = {};
      for (const a of activities) {
        const numId = Number(a.id);
        activityMap[numId] = a;
      }

      const cases = bucketJudgments.map((j) => {
        const act = activityMap[j.activity_id];
        return {
          id: j.id,
          input: act?.summary ?? "",
          output: act?.detail ?? "",
          verdict: j.verdict,
          comment: j.comment,
          source_activity_id: j.activity_id,
          bucket,
        };
      });

      result.jsonl = cases;

      const goodCount = cases.filter((c) => c.verdict === "good" || c.verdict === "golden").length;
      const badCount = cases.filter((c) => c.verdict === "bad" || c.verdict === "bug").length;
      result.results = {
        pass: goodCount,
        fail: badCount,
        summary: `Collection "${bucket}" (${kind}): ${goodCount} pass / ${badCount} fail / ${cases.length - goodCount - badCount} unclassified`,
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[run-eval] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// ── GET /api/run-eval?collection_id=...&collection_name=... ─────────────
//
// Downloadable JSONL export

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const collection_id = searchParams.get("collection_id");
    const collection_name = searchParams.get("collection_name") || collection_id || "export";

    if (!collection_id) {
      return NextResponse.json({ error: "collection_id required" }, { status: 400 });
    }

    const judgments = (await fetchShape("judgments")) as JudgmentRow[];
    const bucketJudgments = judgments.filter((j) => j.collection_id === collection_id);

    const activities = (await fetchShape("activity_log")) as ActivityRow[];
    const activityMap: Record<number, ActivityRow> = {};
    for (const a of activities) {
      const numId = Number(a.id);
      activityMap[numId] = a;
    }

    const lines = bucketJudgments.map((j) => {
      const act = activityMap[j.activity_id];
      return JSON.stringify({
        id: j.id,
        input: act?.summary ?? "",
        output: act?.detail ?? "",
        verdict: j.verdict,
        comment: j.comment,
        source_activity_id: j.activity_id,
        bucket: collection_name,
      });
    });

    const body = lines.join("\n") + (lines.length > 0 ? "\n" : "");

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/jsonl",
        "Content-Disposition": `attachment; filename="${collection_name}.jsonl"`,
      },
    });
  } catch (error) {
    console.error("[run-eval] export error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
