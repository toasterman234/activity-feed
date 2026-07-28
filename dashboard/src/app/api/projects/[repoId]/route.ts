import { NextRequest, NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { pool } from "../../_db";

export const dynamic = "force-dynamic";

function firstLine(text: string): string {
  return (text || "").split("\n").find((line) => line.trim())?.trim() || "Untitled";
}

function preview(text: string, max = 4000): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…`;
}

function readDoc(filePath: string) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf8");
  return {
    path: filePath,
    name: path.basename(filePath),
    updated_at: statSync(filePath).mtime.toISOString(),
    content: preview(content),
  };
}

function readIntakeDocs(repoPath: string) {
  const intakeDir = path.join(repoPath, ".aiwg", "intake");
  if (!existsSync(intakeDir)) return [];
  return readdirSync(intakeDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => readDoc(path.join(intakeDir, name)))
    .filter(Boolean);
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await ctx.params;

  try {
    const repoRes = await pool.query(
      `SELECT id, name, path, git_remote, created_at
         FROM repos
        WHERE id = $1
        LIMIT 1`,
      [repoId],
    );
    const repo = repoRes.rows[0] as {
      id: string;
      name: string;
      path: string;
      git_remote: string | null;
      created_at: string;
    } | undefined;
    if (!repo) {
      return NextResponse.json({ error: "repo not found" }, { status: 404 });
    }

    const [sourceRes, activeRes, threadsRes, artifactsRes, promotionsRes] = await Promise.all([
      pool.query(
        `SELECT tm.thread_id, tm.channel_id, tm.lifecycle, tm.state, tm.updated_at, m.body
           FROM thread_meta tm
           LEFT JOIN messages m ON m.id = tm.thread_id
          WHERE tm.repo_id = $1
            AND tm.promoted_to IS NOT NULL
          ORDER BY tm.updated_at DESC NULLS LAST, tm.thread_id DESC
          LIMIT 1`,
        [repoId],
      ),
      pool.query(
        `SELECT tm.thread_id, tm.channel_id, tm.lifecycle, tm.state, tm.updated_at, m.body
           FROM thread_meta tm
           LEFT JOIN messages m ON m.id = tm.thread_id
          WHERE tm.repo_id = $1
            AND tm.lifecycle = 'issue'
            AND tm.archived_at IS NULL
            AND tm.state NOT IN ('closed', 'wont_fix')
          ORDER BY tm.updated_at DESC NULLS LAST, tm.thread_id DESC
          LIMIT 1`,
        [repoId],
      ),
      pool.query(
        `SELECT tm.thread_id, tm.channel_id, tm.lifecycle, tm.state, tm.archived_at, tm.updated_at, m.body
           FROM thread_meta tm
           LEFT JOIN messages m ON m.id = tm.thread_id
          WHERE tm.repo_id = $1
          ORDER BY tm.updated_at DESC NULLS LAST, tm.thread_id DESC`,
        [repoId],
      ),
      pool.query(
        `SELECT ta.id, ta.thread_id, ta.title, ta.kind, ta.version, ta.created_at, tm.channel_id, m.body AS thread_body
           FROM thread_artifacts ta
           JOIN thread_meta tm ON tm.thread_id = ta.thread_id
           LEFT JOIN messages m ON m.id = ta.thread_id
          WHERE tm.repo_id = $1
          ORDER BY ta.created_at DESC`,
        [repoId],
      ),
      pool.query(
        `SELECT tp.id, tp.thread_id, tp.repo_path, tp.status, tp.error_detail,
                tp.agent_provider, tp.agent_model, tp.progress, tp.created_at, tp.completed_at,
                tm.channel_id, m.body AS thread_body
           FROM thread_promotions tp
           JOIN thread_meta tm ON tm.thread_id = tp.thread_id
           LEFT JOIN messages m ON m.id = tp.thread_id
          WHERE tm.repo_id = $1
          ORDER BY tp.created_at DESC`,
        [repoId],
      ),
    ]);

    const source = sourceRes.rows[0]
      ? {
          ...sourceRes.rows[0],
          title: firstLine(String(sourceRes.rows[0].body || "")),
        }
      : null;

    const activeThread = activeRes.rows[0]
      ? {
          ...activeRes.rows[0],
          title: firstLine(String(activeRes.rows[0].body || "")),
        }
      : null;

    const docs = ["WORKSPACE.md", "AIWG.md", "CLAUDE.md", "README.md"]
      .map((name) => readDoc(path.join(repo.path, name)))
      .filter(Boolean);

    return NextResponse.json({
      repo: {
        ...repo,
        exists_on_disk: existsSync(repo.path),
        scaffold_detected: existsSync(path.join(repo.path, ".aiwg")) || existsSync(path.join(repo.path, "AIWG.md")),
      },
      source_thread: source,
      active_thread: activeThread,
      threads: threadsRes.rows.map((row) => ({
        ...row,
        title: firstLine(String(row.body || "")),
      })),
      artifacts: artifactsRes.rows.map((row) => ({
        ...row,
        thread_title: firstLine(String(row.thread_body || "")),
      })),
      promotions: promotionsRes.rows.map((row) => ({
        ...row,
        thread_title: firstLine(String(row.thread_body || "")),
      })),
      aiwg: {
        docs,
        intake_docs: readIntakeDocs(repo.path),
      },
    });
  } catch (err) {
    console.error("[projects/:repoId] GET failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
