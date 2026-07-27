import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";
import { canTransition } from "@/app/channels/lifecycles";

// Direct Postgres writes for channels/channel_members/messages — same
// reasoning as api/judgments/write/route.ts: Postgres is the source of
// truth, electric-circuits only replicates it one-way out to the dashboard.

type ChannelRow = { id: string; name: string; description: string; created_at: string };
type MemberRow = { id: string; channel_id: string; member_type: string; member_name: string; created_at: string };
type MessageRow = { id: string; channel_id: string; thread_id: string | null; author: string; body: string; created_at: string };
type ThreadPlanRow = { id: string; thread_id: string; title: string; status: string; sort_order: number; created_at: string; updated_at: string };
type WorkflowStepRow = { id: string; thread_id: string; step_label: string; status: string; detail: string; created_at: string };
type ThreadArtifactRow = { id: string; thread_id: string; title: string; kind: string; content: string; version: number; created_at: string };

function parseGraphChannelAllowlist(): string[] {
  const raw = process.env.CHANNEL_GRAPH_CHANNELS;
  if (raw == null) return ["meta"];
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^#/, ""))
    .filter(Boolean);
}

async function isGraphEnabledForChannel(channelId: string): Promise<boolean> {
  if (process.env.CHANNEL_GRAPH !== "1") return false;
  const allowlist = parseGraphChannelAllowlist();
  if (allowlist.length === 0) return true;
  if (allowlist.includes(channelId)) return true;
  try {
    const res = await pool.query(`SELECT name FROM channels WHERE id = $1 LIMIT 1`, [channelId]);
    const liveName = String(res.rows[0]?.name || "").trim().replace(/^#/, "");
    return !!liveName && allowlist.includes(liveName);
  } catch {
    return false;
  }
}

function parseDecisionDraft(body: string) {
  const trimmed = body.trim();
  if (!trimmed.toLowerCase().startsWith("decide:")) return null;
  const lines = trimmed.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const statement = lines[0].slice("decide:".length).trim();
  if (!statement) return null;
  let supersedes: string | null = null;
  const rationaleLines: string[] = [];
  for (const line of lines.slice(1)) {
    if (line.toLowerCase().startsWith("supersedes:")) {
      supersedes = line.slice("supersedes:".length).trim() || null;
      continue;
    }
    rationaleLines.push(line);
  }
  return {
    statement,
    supersedes,
    rationale: rationaleLines.join("\n").trim() || null,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { table, row } = body as {
    table: string;
    row: ChannelRow | MemberRow | MessageRow | ThreadPlanRow | WorkflowStepRow | ThreadArtifactRow;
  };

  try {
    if (table === "channel_members") {
      const r = row as MemberRow;
      await pool.query(
        `INSERT INTO channel_members (id, channel_id, member_type, member_name, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [r.id, r.channel_id, r.member_type, r.member_name, r.created_at]
      );
    } else if (table === "messages") {
      const r = row as MessageRow;
      await pool.query(
        `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [r.id, r.channel_id, r.thread_id, r.author, r.body, r.created_at]
      );
      const draft = parseDecisionDraft(r.body);
      if (draft && r.thread_id && await isGraphEnabledForChannel(r.channel_id)) {
        await pool.query(
          `INSERT INTO graph_decisions (id, channel_id, thread_id, statement, rationale, evidence, status, supersedes, created_at)
           VALUES ($1, $2, $3, $4, $5, '[]', 'pending', $6, $7)`,
          [randomUUID(), r.channel_id, r.thread_id, draft.statement, draft.rationale, draft.supersedes, r.created_at]
        );
      }
    } else if (table === "thread_plans") {
      const r = row as ThreadPlanRow;
      await pool.query(
        `INSERT INTO thread_plans (id, thread_id, title, status, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET status = $4, updated_at = $7`,
        [r.id, r.thread_id, r.title, r.status, r.sort_order ?? 0, r.created_at, r.updated_at]
      );
    } else if (table === "thread_workflow_steps") {
      const r = row as WorkflowStepRow;
      await pool.query(
        `INSERT INTO thread_workflow_steps (id, thread_id, step_label, status, detail, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET status = $4, detail = $5`,
        [r.id, r.thread_id, r.step_label, r.status, r.detail ?? "", r.created_at]
      );
    } else if (table === "thread_artifacts") {
      const r = row as ThreadArtifactRow;
      await pool.query(
        `INSERT INTO thread_artifacts (id, thread_id, title, kind, content, version, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [r.id, r.thread_id, r.title, r.kind, r.content, r.version ?? 1, r.created_at]
      );
    } else if (table === "thread_meta") {
      const r = row as Record<string, unknown>;
      const isLifecycleSwitch = typeof r._lifecycle_switch === "string";
      if (isLifecycleSwitch) {
        // Lifecycle switch: only allowed while state is "drafted"
        const current = await pool.query(
          `SELECT state FROM thread_meta WHERE thread_id = $1`,
          [r.thread_id]
        );
        const oldState = (current.rows[0]?.state as string) || null;
        if (oldState !== null && oldState !== "drafted") {
          return NextResponse.json(
            { error: "lifecycle locked — can only switch while state is 'drafted'", currentState: oldState },
            { status: 409 }
          );
        }
      }
      // State change enforcement: check canTransition
      if (typeof r.state === "string" && typeof r.thread_id === "string") {
        const current = await pool.query(
          `SELECT state, lifecycle FROM thread_meta WHERE thread_id = $1`,
          [r.thread_id]
        );
        const oldState = (current.rows[0]?.state as string) || null;
        const lc = (current.rows[0]?.lifecycle as string) || String(r.lifecycle || "coding");
        if (oldState && oldState !== r.state && !isLifecycleSwitch) {
          if (!canTransition(lc, oldState, String(r.state))) {
            return NextResponse.json(
              { error: "illegal transition", from: oldState, to: r.state },
              { status: 409 }
            );
          }
        }
      }
      await pool.query(
        `INSERT INTO thread_meta (thread_id, channel_id, lifecycle, state, enabled_workflows, research_mode,
          priority, assignee, repo_id, labels, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (thread_id) DO UPDATE SET
           lifecycle = COALESCE($3, thread_meta.lifecycle),
           state = COALESCE($4, thread_meta.state),
           enabled_workflows = COALESCE($5, thread_meta.enabled_workflows),
           research_mode = COALESCE($6, thread_meta.research_mode),
           priority = COALESCE($7, thread_meta.priority),
           assignee = COALESCE($8, thread_meta.assignee),
           repo_id = COALESCE($9, thread_meta.repo_id),
           labels = COALESCE($10, thread_meta.labels),
           updated_at = $11`,
        [
          r.thread_id, r.channel_id,
          r.lifecycle, r.state,
          String(r.enabled_workflows ?? "[]"),
          (r.research_mode as string | undefined) ?? null,
          (r.priority as string | undefined) ?? null,
          (r.assignee as string | undefined) ?? null,
          (r.repo_id as string | undefined) ?? null,
          (r.labels as string | undefined) ?? null,
          r.updated_at || new Date().toISOString()
        ]
      );
    } else if (table === "channels") {
      // Support creating with default_lifecycle, and updating it on existing channels
      const r = row as Record<string, unknown>;
      if (r.default_lifecycle !== undefined || r.id) {
        await pool.query(
          `INSERT INTO channels (id, name, description, default_lifecycle, created_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             default_lifecycle = COALESCE($4, channels.default_lifecycle)`,
          [r.id, r.name || "", r.description || "", r.default_lifecycle || null, r.created_at || new Date().toISOString()]
        );
      } else {
        const c = row as ChannelRow;
        await pool.query(
          `INSERT INTO channels (id, name, description, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [c.id, c.name, c.description, c.created_at]
        );
      }
    } else if (table === "channel_read_state") {
      const r = row as unknown as { viewer_id?: string; channel_id: string; last_read_at: string };
      const viewerId = r.viewer_id || "you";
      if (!r.channel_id || !r.last_read_at) {
        return NextResponse.json({ error: "channel_id and last_read_at required" }, { status: 400 });
      }
      await pool.query(
        `INSERT INTO channel_read_state (viewer_id, channel_id, last_read_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (viewer_id, channel_id) DO UPDATE SET last_read_at = $3`,
        [viewerId, r.channel_id, r.last_read_at]
      );
    } else {
      return NextResponse.json({ error: `unsupported table: ${table}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[channels/write] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
