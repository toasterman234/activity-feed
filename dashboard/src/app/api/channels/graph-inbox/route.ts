import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";
import { applyProposalChanges } from "@/app/channels/capabilities";

export const dynamic = "force-dynamic";

async function insertMessage(row: {
  id: string;
  channel_id: string;
  thread_id: string | null;
  author: string;
  body: string;
  created_at: string;
}) {
  await pool.query(
    `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [row.id, row.channel_id, row.thread_id, row.author, row.body, row.created_at],
  );
}

async function writeGraphEvent(row: {
  channelId: string;
  threadId: string | null;
  kind: string;
  actor: string;
  payload?: Record<string, unknown>;
}) {
  await pool.query(
    `INSERT INTO graph_events (id, channel_id, thread_id, kind, actor, payload, caused_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      row.channelId,
      row.threadId,
      row.kind,
      row.actor,
      JSON.stringify(row.payload || {}),
      null,
      new Date().toISOString(),
    ],
  );
}

async function writeGraphRelation(type: string, sourceId: string, targetId: string) {
  await pool.query(
    `INSERT INTO graph_relations (id, type, source_id, target_id, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), type, sourceId, targetId, new Date().toISOString()],
  );
}

export async function GET() {
  try {
    const [decisions, proposals, memoryCandidates] = await Promise.all([
      pool.query(
        `SELECT d.id, d.channel_id, d.thread_id, d.statement, d.rationale, d.evidence,
                d.status, d.supersedes, sd.statement AS supersedes_statement,
                d.created_at, d.resolved_at,
                c.name AS channel_name, m.body AS thread_title
           FROM graph_decisions d
      LEFT JOIN graph_decisions sd ON sd.id = d.supersedes
      LEFT JOIN channels c ON c.id = d.channel_id
      LEFT JOIN messages m ON m.id = d.thread_id
          WHERE d.status = 'pending'
          ORDER BY d.created_at DESC
          LIMIT 100`,
      ),
      pool.query(
        `SELECT p.id, p.channel_id, p.thread_id, p.hypothesis, p.capability_ids, p.changes,
                p.evidence, p.status, p.created_at, p.resolved_at,
                p.resolved_by, p.resolution_rationale,
                c.name AS channel_name, m.body AS thread_title
           FROM graph_proposals p
      LEFT JOIN channels c ON c.id = p.channel_id
      LEFT JOIN messages m ON m.id = p.thread_id
          WHERE p.status = 'pending'
          ORDER BY p.created_at DESC
          LIMIT 100`,
      ),
      pool.query(
        `SELECT mc.id, mc.channel_id, mc.thread_id, mc.text, mc.category, mc.confidence,
                mc.status, mc.created_at,
                c.name AS channel_name, m.body AS thread_title
           FROM graph_memory_candidates mc
      LEFT JOIN channels c ON c.id = mc.channel_id
      LEFT JOIN messages m ON m.id = mc.thread_id
          WHERE mc.status = 'pending'
          ORDER BY mc.created_at DESC
          LIMIT 100`,
      ),
    ]);

    return NextResponse.json({
      decisions: decisions.rows,
      proposals: proposals.rows,
      memoryCandidates: memoryCandidates.rows,
    });
  } catch (err) {
    console.error("[channels/graph-inbox] GET failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    action,
    kind,
    id,
    status,
    resolutionRationale,
    reviewer,
    channelId,
    threadId,
    statement,
    rationale,
    supersedes,
  } = body as {
    action?: "create" | "resolve";
    kind?: "decision" | "proposal" | "memory";
    id?: string;
    status?: string;
    resolutionRationale?: string;
    reviewer?: string;
    channelId?: string;
    threadId?: string | null;
    statement?: string;
    rationale?: string;
    supersedes?: string | null;
  };

  const actor = reviewer || "you";
  const nextAction = action || "resolve";

  try {
    if (nextAction === "create") {
      if (kind !== "decision") {
        return NextResponse.json({ error: `unsupported create kind: ${kind}` }, { status: 400 });
      }
      const channel = String(channelId || "").trim();
      const thread = String(threadId || "").trim() || null;
      const decisionStatement = String(statement || "").trim();
      if (!channel || !thread || !decisionStatement) {
        return NextResponse.json({ error: "channelId, threadId, and statement are required" }, { status: 400 });
      }
      const now = new Date().toISOString();
      const decisionId = randomUUID();
      await pool.query(
        `INSERT INTO graph_decisions (id, channel_id, thread_id, statement, rationale, evidence, status, supersedes, created_at)
         VALUES ($1, $2, $3, $4, $5, '[]', 'pending', $6, $7)`,
        [decisionId, channel, thread, decisionStatement, rationale || null, supersedes || null, now],
      );
      await writeGraphEvent({
        channelId: channel,
        threadId: thread,
        kind: "decision_created",
        actor,
        payload: { decisionId, statement: decisionStatement, supersedes: supersedes || null },
      }).catch(() => {});
      await insertMessage({
        id: randomUUID(),
        channel_id: channel,
        thread_id: thread,
        author: "system",
        body: `📋 Decision proposed: ${decisionStatement}${supersedes ? `\nSupersedes: ${supersedes}` : ""}\n\nReview it in Channels → Inbox.`,
        created_at: now,
      }).catch(() => {});
      return NextResponse.json({ ok: true, id: decisionId });
    }

    if (!kind || !id || !status) {
      return NextResponse.json({ error: "kind, id, and status required" }, { status: 400 });
    }

    if (kind === "decision") {
      if (status !== "active" && status !== "rejected") {
        return NextResponse.json({ error: "decision status must be active or rejected" }, { status: 400 });
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query(
          `SELECT id, channel_id, thread_id, statement, supersedes
             FROM graph_decisions
            WHERE id = $1
            LIMIT 1`,
          [id],
        );
        const row = existing.rows[0] as {
          channel_id: string;
          thread_id: string | null;
          statement: string;
          supersedes: string | null;
        } | undefined;
        if (!row) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "decision not found" }, { status: 404 });
        }
        const now = new Date().toISOString();
        await client.query(
          `UPDATE graph_decisions
              SET status = $2,
                  resolved_by = $3,
                  resolution_rationale = $4,
                  resolved_at = $5
            WHERE id = $1`,
          [id, status, actor, resolutionRationale || null, now],
        );
        let supersededStatement: string | null = null;
        if (status === "active" && row.supersedes) {
          const prior = await client.query(
            `SELECT id, statement
               FROM graph_decisions
              WHERE id = $1
              LIMIT 1`,
            [row.supersedes],
          );
          const priorRow = prior.rows[0] as { id: string; statement: string } | undefined;
          if (priorRow) {
            supersededStatement = priorRow.statement;
            await client.query(
              `UPDATE graph_decisions
                  SET status = 'superseded',
                      resolved_by = $2,
                      resolution_rationale = $3,
                      resolved_at = $4
                WHERE id = $1 AND status = 'active'`,
              [priorRow.id, actor, resolutionRationale || `Superseded by ${row.statement}`, now],
            );
            await client.query(
              `INSERT INTO graph_relations (id, type, source_id, target_id, created_at)
               VALUES ($1, 'supersedes', $2, $3, $4)`,
              [randomUUID(), id, priorRow.id, now],
            );
          }
        }
        await client.query("COMMIT");
        await writeGraphEvent({
          channelId: row.channel_id,
          threadId: row.thread_id,
          kind: status === "active" ? "decision_activated" : "decision_rejected",
          actor,
          payload: { decisionId: id, status, statement: row.statement, supersedes: row.supersedes, supersededStatement },
        }).catch(() => {});
        if (row.thread_id) {
          const prefix = status === "active" ? "✅ Decision accepted" : "🛑 Decision rejected";
          const why = resolutionRationale?.trim() ? `\n\nWhy: ${resolutionRationale.trim()}` : "";
          const extra = status === "active" && supersededStatement ? `\nSuperseded prior decision: ${supersededStatement}` : "";
          await insertMessage({
            id: randomUUID(),
            channel_id: row.channel_id,
            thread_id: row.thread_id,
            author: "system",
            body: `${prefix}: ${row.statement}${extra}${why}`,
            created_at: new Date().toISOString(),
          }).catch(() => {});
        }
        return NextResponse.json({ ok: true });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    if (kind === "memory") {
      if (status !== "accepted" && status !== "rejected") {
        return NextResponse.json({ error: "memory status must be accepted or rejected" }, { status: 400 });
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query(
          `SELECT id, channel_id, thread_id, text, category
             FROM graph_memory_candidates
            WHERE id = $1
            LIMIT 1`,
          [id],
        );
        const row = existing.rows[0] as {
          channel_id: string;
          thread_id: string | null;
          text: string;
          category: string;
        } | undefined;
        if (!row) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "memory candidate not found" }, { status: 404 });
        }
        const now = new Date().toISOString();
        await client.query(
          `UPDATE graph_memory_candidates
              SET status = $2,
                  resolved_by = $3,
                  resolution_rationale = $4,
                  resolved_at = $5
            WHERE id = $1`,
          [id, status, actor, resolutionRationale || null, now],
        );
        if (status === "accepted") {
          await client.query(
            `INSERT INTO graph_memory_items (id, channel_id, thread_id, candidate_id, text, category, created_at)
             SELECT $2, channel_id, thread_id, id, text, category, $3
               FROM graph_memory_candidates
              WHERE id = $1
                AND NOT EXISTS (SELECT 1 FROM graph_memory_items mi WHERE mi.candidate_id = $1)`,
            [id, randomUUID(), now],
          );
        }
        await client.query("COMMIT");
        await writeGraphEvent({
          channelId: row.channel_id,
          threadId: row.thread_id,
          kind: "memory_candidate_resolved",
          actor,
          payload: { candidateId: id, status, text: row.text, category: row.category },
        }).catch(() => {});
        if (row.thread_id) {
          const prefix = status === "accepted" ? "✅ Memory accepted" : "🛑 Memory rejected";
          const why = resolutionRationale?.trim() ? `\n\nWhy: ${resolutionRationale.trim()}` : "";
          await insertMessage({
            id: randomUUID(),
            channel_id: row.channel_id,
            thread_id: row.thread_id,
            author: "system",
            body: `${prefix}: [${row.category}] ${row.text}${why}`,
            created_at: new Date().toISOString(),
          }).catch(() => {});
        }
        return NextResponse.json({ ok: true });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    if (kind === "proposal") {
      if (status !== "accepted" && status !== "rejected") {
        return NextResponse.json({ error: "proposal status must be accepted or rejected" }, { status: 400 });
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query(
          `SELECT id, channel_id, thread_id, hypothesis, capability_ids, changes
             FROM graph_proposals
            WHERE id = $1
            LIMIT 1`,
          [id],
        );
        const row = existing.rows[0] as {
          channel_id: string;
          thread_id: string | null;
          hypothesis: string;
          capability_ids: string;
          changes: string;
        } | undefined;
        if (!row) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "proposal not found" }, { status: 404 });
        }
        const now = new Date().toISOString();
        let appliedSummary: Array<{ capabilityId: string; summary: string }> = [];
        let nextStatus = status;
        if (status === "accepted") {
          await client.query("COMMIT");
          appliedSummary = await applyProposalChanges({
            proposalId: id,
            channelId: row.channel_id,
            capabilityIds: JSON.parse(row.capability_ids || "[]"),
            changes: JSON.parse(row.changes || "[]"),
            actor,
          });
          await client.query("BEGIN");
          nextStatus = "applied";
        }
        await client.query(
          `UPDATE graph_proposals
              SET status = $2,
                  resolved_by = $3,
                  resolution_rationale = $4,
                  resolved_at = $5
            WHERE id = $1`,
          [id, nextStatus, actor, resolutionRationale || null, now],
        );
        await client.query("COMMIT");
        await writeGraphEvent({
          channelId: row.channel_id,
          threadId: row.thread_id,
          kind: status === "accepted" ? "proposal_applied" : "proposal_rejected",
          actor,
          payload: { proposalId: id, status: nextStatus, hypothesis: row.hypothesis, appliedSummary, rationale: resolutionRationale || null },
        }).catch(() => {});
        if (row.thread_id) {
          const prefix = status === "accepted" ? "✅ Proposal applied" : "🛑 Proposal rejected";
          const summary = appliedSummary.length > 0
            ? `\n\nApplied:\n${appliedSummary.map((item) => `- ${item.capabilityId}: ${item.summary}`).join("\n")}`
            : "";
          const why = resolutionRationale?.trim() ? `\n\nWhy: ${resolutionRationale.trim()}` : "";
          await insertMessage({
            id: randomUUID(),
            channel_id: row.channel_id,
            thread_id: row.thread_id,
            author: "system",
            body: `${prefix}: ${row.hypothesis}${summary}${why}`,
            created_at: new Date().toISOString(),
          }).catch(() => {});
        }
        return NextResponse.json({ ok: true, appliedSummary });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    return NextResponse.json({ error: `unsupported kind: ${kind}` }, { status: 400 });
  } catch (err) {
    console.error("[channels/graph-inbox] POST failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
