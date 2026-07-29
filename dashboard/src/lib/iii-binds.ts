import { randomUUID } from "node:crypto";
import { pool } from "@/app/api/_db";
import { defaultEnabledWorkflows } from "@/app/channels/lifecycles";

export type IiiBind = {
  session_id: string;
  thread_id: string;
  channel_id: string;
  repo_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
  url: string;
  created_thread?: boolean;
};

const III_CHANNEL_NAME = process.env.CHANNEL_III_NAME?.trim() || "iii";

export async function getBind(sessionId: string): Promise<IiiBind | null> {
  const res = await pool.query(
    `SELECT session_id, thread_id, channel_id, repo_id, title, created_at, updated_at
       FROM iii_session_binds
      WHERE session_id = $1`,
    [sessionId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return rowToBind(row);
}

function rowToBind(row: Record<string, unknown>, createdThread = false): IiiBind {
  const threadId = String(row.thread_id);
  const channelId = String(row.channel_id);
  return {
    session_id: String(row.session_id),
    thread_id: threadId,
    channel_id: channelId,
    repo_id: row.repo_id == null || row.repo_id === "" ? null : String(row.repo_id),
    title: row.title == null || row.title === "" ? null : String(row.title),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    url: `/channels/${channelId}/${threadId}`,
    ...(createdThread ? { created_thread: true } : {}),
  };
}

async function ensureIiiChannel(): Promise<{ id: string; name: string }> {
  const existing = await pool.query(
    `SELECT id, name, default_lifecycle FROM channels WHERE lower(name) = lower($1) LIMIT 1`,
    [III_CHANNEL_NAME],
  );
  if (existing.rows[0]) {
    return { id: String(existing.rows[0].id), name: String(existing.rows[0].name) };
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO channels (id, name, description, default_lifecycle, created_at)
     VALUES ($1, $2, $3, 'coding', $4)`,
    [id, III_CHANNEL_NAME, "iii harness session work threads", now],
  );
  return { id, name: III_CHANNEL_NAME };
}

async function threadExists(threadId: string): Promise<{ channel_id: string; repo_id: string | null } | null> {
  const res = await pool.query(
    `SELECT channel_id, repo_id FROM thread_meta WHERE thread_id = $1`,
    [threadId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    channel_id: String(row.channel_id),
    repo_id: row.repo_id == null ? null : String(row.repo_id),
  };
}

async function createHarnessThread(opts: {
  channelId: string;
  title: string;
  repoId: string | null;
  sessionId: string;
}): Promise<string> {
  const threadId = randomUUID();
  const now = new Date().toISOString();
  const bodyText =
    `${opts.title}\n\n` +
    `iii harness work thread for session \`${opts.sessionId}\`.\n` +
    `Use dashboard::tasks::* to manage tasks on this thread.`;

  await pool.query(
    `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
     VALUES ($1, $2, NULL, 'iii', $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [threadId, opts.channelId, bodyText, now],
  );

  await pool.query(
    `INSERT INTO thread_meta (
       thread_id, channel_id, lifecycle, state, enabled_workflows,
       research_mode, priority, assignee, repo_id, labels, created_at, updated_at
     ) VALUES ($1, $2, 'coding', 'drafted', $3, NULL, 'normal', 'iii', $4, $5, $6, $6)
     ON CONFLICT (thread_id) DO UPDATE SET updated_at = EXCLUDED.updated_at`,
    [
      threadId,
      opts.channelId,
      JSON.stringify(defaultEnabledWorkflows("coding")),
      opts.repoId,
      JSON.stringify(["iii", `session:${opts.sessionId}`]),
      now,
    ],
  );

  await pool.query(
    `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
     VALUES ($1, $2, $3, 'system', $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [
      randomUUID(),
      opts.channelId,
      threadId,
      `Bound to iii session **${opts.sessionId}**. Tasks written via dashboard::tasks land here.`,
      now,
    ],
  );

  return threadId;
}

export type UpsertBindInput = {
  session_id: string;
  thread_id?: string | null;
  channel_id?: string | null;
  repo_id?: string | null;
  title?: string | null;
  ensure_thread?: boolean;
};

export async function upsertBind(input: UpsertBindInput): Promise<IiiBind> {
  const sessionId = input.session_id.trim();
  if (!sessionId) throw new Error("session_id is required");

  const now = new Date().toISOString();
  let threadId = (input.thread_id || "").trim();
  let channelId = (input.channel_id || "").trim();
  let repoId = input.repo_id === undefined || input.repo_id === null ? null : String(input.repo_id).trim() || null;
  let title = input.title === undefined || input.title === null ? null : String(input.title).trim() || null;
  let createdThread = false;

  if (threadId) {
    const meta = await threadExists(threadId);
    if (!meta) throw Object.assign(new Error("thread not found"), { code: "not_found" });
    channelId = meta.channel_id;
    if (repoId == null) repoId = meta.repo_id;
  } else if (input.ensure_thread) {
    if (repoId) {
      const repo = await pool.query(`SELECT id FROM repos WHERE id = $1`, [repoId]);
      if (!repo.rows[0]) throw Object.assign(new Error("repo not found"), { code: "not_found" });
    }
    const channel = channelId
      ? await pool.query(`SELECT id, name FROM channels WHERE id = $1`, [channelId]).then((r) => r.rows[0])
      : null;
    const ensured = channel
      ? { id: String(channel.id), name: String(channel.name) }
      : await ensureIiiChannel();
    channelId = ensured.id;
    title = title || `iii session ${sessionId.slice(0, 12)}`;
    threadId = await createHarnessThread({
      channelId,
      title,
      repoId,
      sessionId,
    });
    createdThread = true;
  } else {
    throw Object.assign(new Error("thread_id is required unless ensure_thread=true"), { code: "invalid" });
  }

  await pool.query(
    `INSERT INTO iii_session_binds (session_id, thread_id, channel_id, repo_id, title, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT (session_id) DO UPDATE SET
       thread_id = EXCLUDED.thread_id,
       channel_id = EXCLUDED.channel_id,
       repo_id = EXCLUDED.repo_id,
       title = COALESCE(EXCLUDED.title, iii_session_binds.title),
       updated_at = EXCLUDED.updated_at`,
    [sessionId, threadId, channelId, repoId, title, now],
  );

  const bind = await getBind(sessionId);
  if (!bind) throw new Error("bind write failed");
  return createdThread ? { ...bind, created_thread: true } : bind;
}
