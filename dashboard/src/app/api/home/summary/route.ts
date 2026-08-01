import { NextResponse } from "next/server";
import { getAgentRuntimeHealth, fetchActivityHighlights } from "../_queries";

export const dynamic = "force-dynamic";

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

export async function GET() {
  try {
    const [agents, highlightsRes] = await Promise.all([
      getAgentRuntimeHealth(),
      fetchActivityHighlights(),
    ]);

    const recentHighlights = (highlightsRes?.rows || [])
      .filter((row) => row.source !== "setup")
      .slice(0, 6)
      .map((row) => {
        const detail = parseJson<{ project?: string; session_id?: string }>(row.detail);
        return {
          id: row.id,
          source: row.source,
          summary: row.summary,
          project: detail?.project || null,
          sessionId: detail?.session_id || null,
          createdAt: row.created_at,
          importance: (
            `${row.source} ${row.summary}`.toLowerCase().includes("failed") ||
            `${row.source} ${row.summary}`.toLowerCase().includes("promot") ||
            `${row.source} ${row.summary}`.toLowerCase().includes("block") ||
            row.source === "pi"
          ) ? "high" as const : "normal" as const,
        };
      });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      agents,
      recentHighlights,
    });
  } catch (error) {
    console.error("[home/summary] failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
