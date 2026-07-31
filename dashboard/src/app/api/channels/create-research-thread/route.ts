import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";
import { LIFECYCLES } from "@/app/channels/lifecycles";

export const dynamic = "force-dynamic";

const QUANT_CHANNEL_ID = "08bf3d95-a069-4693-937d-553b49c86c77";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    title,
    kind = "theme",
    symbols = [],
    summary = "",
  } = body as {
    title?: string;
    kind?: string;
    symbols?: string[];
    summary?: string;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const lifecycle = "research";
  const lc = LIFECYCLES[lifecycle];
  if (!lc) {
    return NextResponse.json({ error: "Research lifecycle not found" }, { status: 500 });
  }

  const now = new Date().toISOString();
  const threadId = randomUUID();
  const rootMessageId = threadId; // thread root message shares thread id

  try {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");

      // 1. Thread meta
      await db.query(
        `INSERT INTO thread_meta (thread_id, channel_id, lifecycle, state, priority, labels, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          threadId,
          QUANT_CHANNEL_ID,
          lifecycle,
          lc.initial, // "drafted"
          "normal",
          JSON.stringify([kind]),
          now,
        ],
      );

      // 2. Root message (the case brief)
      const symbolsBlock = symbols.length > 0
        ? `\n\n**Symbols:** ${symbols.map((s: string) => s.toUpperCase()).join(", ")}`
        : "";
      const summaryBlock = summary.trim()
        ? `\n\n**Summary:** ${summary.trim()}`
        : "";
      const messageBody = `New ${kind}: **${title.trim()}**${symbolsBlock}${summaryBlock}`;

      await db.query(
        `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [rootMessageId, QUANT_CHANNEL_ID, threadId, "you", messageBody, now],
      );

      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }

    return NextResponse.json({
      ok: true,
      threadId,
      channelId: QUANT_CHANNEL_ID,
      threadUrl: `/channels/${QUANT_CHANNEL_ID}/${threadId}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create research thread" },
      { status: 500 },
    );
  }
}
