import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "../../_db";
import { defaultEnabledWorkflows } from "@/app/channels/lifecycles";

export const dynamic = "force-dynamic";

const ISSUES_CHANNEL_NAME = process.env.CHANNEL_ISSUES_NAME?.trim() || "Issues";

async function ensureIssuesChannel(): Promise<{ id: string; name: string }> {
  const existing = await pool.query(
    `SELECT id, name, default_lifecycle FROM channels WHERE lower(name) = lower($1) LIMIT 1`,
    [ISSUES_CHANNEL_NAME],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0] as { id: string; name: string; default_lifecycle: string | null };
    if (row.default_lifecycle !== "issue") {
      await pool.query(
        `UPDATE channels SET default_lifecycle = 'issue' WHERE id = $1`,
        [row.id],
      );
    }
    return { id: row.id, name: row.name };
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO channels (id, name, description, default_lifecycle, created_at)
     VALUES ($1, $2, $3, 'issue', $4)`,
    [id, ISSUES_CHANNEL_NAME, "Work threads bound to registered projects", now],
  );
  return { id, name: ISSUES_CHANNEL_NAME };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const repoId = String(body?.repoId || "").trim();
    const forceNew = body?.forceNew === true;
    if (!repoId) {
      return NextResponse.json({ error: "repoId required" }, { status: 400 });
    }

    const repoRes = await pool.query(
      `SELECT id, name, path FROM repos WHERE id = $1`,
      [repoId],
    );
    const repo = repoRes.rows[0] as { id: string; name: string; path: string } | undefined;
    if (!repo) {
      return NextResponse.json({ error: "repo not found" }, { status: 404 });
    }

    const channel = await ensureIssuesChannel();
    if (!forceNew) {
      const existingThreadRes = await pool.query(
        `SELECT thread_id
           FROM thread_meta
          WHERE channel_id = $1
            AND lifecycle = 'issue'
            AND repo_id = $2
            AND archived_at IS NULL
            AND state NOT IN ('closed', 'wont_fix')
          ORDER BY updated_at DESC NULLS LAST, thread_id DESC
          LIMIT 1`,
        [channel.id, repo.id],
      );
      const existingThreadId = existingThreadRes.rows[0]?.thread_id as string | undefined;
      if (existingThreadId) {
        return NextResponse.json({
          ok: true,
          reused: true,
          channelId: channel.id,
          threadId: existingThreadId,
          repo: { id: repo.id, name: repo.name, path: repo.path },
          url: `/channels/${channel.id}/${existingThreadId}`,
        });
      }
    }

    const threadId = randomUUID();
    const now = new Date().toISOString();
    const title = `Work: ${repo.name}`;
    const bodyText =
      `${title}\n\n` +
      `Working session for project \`${repo.name}\`.\n` +
      `Repo path: \`${repo.path}\`\n\n` +
      `Mention @pi or @claude to work in this repo.`;

    await pool.query(
      `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
       VALUES ($1, $2, NULL, 'you', $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [threadId, channel.id, bodyText, now],
    );

    await pool.query(
      `INSERT INTO thread_meta (
         thread_id, channel_id, lifecycle, state, enabled_workflows,
         research_mode, priority, assignee, repo_id, labels, updated_at
       ) VALUES ($1, $2, 'issue', 'open', $3, NULL, 'medium', NULL, $4, '[]', $5)
       ON CONFLICT (thread_id) DO UPDATE SET
         repo_id = EXCLUDED.repo_id,
         updated_at = EXCLUDED.updated_at`,
      [
        threadId,
        channel.id,
        JSON.stringify(defaultEnabledWorkflows("issue")),
        repo.id,
        now,
      ],
    );

    // System note so the bound cwd is obvious in-thread
    await pool.query(
      `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
       VALUES ($1, $2, $3, 'system', $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        randomUUID(),
        channel.id,
        threadId,
        `Bound to project **${repo.name}**. Agent cwd: \`${repo.path}\`. Use @pi / @claude to work here.`,
        now,
      ],
    );

    return NextResponse.json({
      ok: true,
      reused: false,
      channelId: channel.id,
      threadId,
      repo: { id: repo.id, name: repo.name, path: repo.path },
      url: `/channels/${channel.id}/${threadId}`,
    });
  } catch (err) {
    console.error("[projects/work] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
