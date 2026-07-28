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

function inferProjectPhase(
  threads: Array<{ lifecycle: string; state: string; archived_at: string | null }>,
  scaffoldDetected: boolean,
) {
  const active = threads.filter((thread) => !thread.archived_at);
  const activePlanning = active.filter((thread) => thread.lifecycle === "planning");
  const activeDelivery = active.filter((thread) => ["issue", "coding", "research"].includes(thread.lifecycle));
  const acceptedPlanning = threads.find((thread) => thread.lifecycle === "planning" && thread.state === "accepted");

  if (activePlanning.length > 0) {
    return {
      phase: "planning",
      label: "Planning",
      reason: "A planning thread is currently active for this project.",
      recommended_thread_lifecycle: "planning",
      recommended_action: "Resume the planning thread and move it through review/accepted.",
    };
  }
  if (activeDelivery.length > 0) {
    return {
      phase: "execution",
      label: "Execution",
      reason: "There is active delivery work running in repo-bound threads.",
      recommended_thread_lifecycle: activeDelivery[0].lifecycle,
      recommended_action: "Resume the active work thread or start a fresh issue thread for a new lane.",
    };
  }
  if (acceptedPlanning) {
    return {
      phase: "ready",
      label: "Ready for delivery",
      reason: "Planning has been accepted and there is no active delivery thread right now.",
      recommended_thread_lifecycle: "issue",
      recommended_action: "Start an issue thread to break execution into concrete work lanes.",
    };
  }
  if (scaffoldDetected) {
    return {
      phase: "intake",
      label: "Intake",
      reason: "The AIWG scaffold exists, but there is no accepted planning or active delivery thread yet.",
      recommended_thread_lifecycle: "planning",
      recommended_action: "Start a planning thread and use it to set scope before execution.",
    };
  }
  return {
    phase: "unstructured",
    label: "Unstructured",
    reason: "This repo is registered, but it is not yet scaffolded or planned in the dashboard.",
    recommended_thread_lifecycle: "planning",
    recommended_action: "Start with a planning thread or promote/scaffold the repo into the AIWG flow.",
  };
}

export async function GET(req: NextRequest) {
  const repoId = req.nextUrl.searchParams.get("repoId")?.trim();
  if (!repoId) {
    return NextResponse.json({ error: "repoId required" }, { status: 400 });
  }

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

    const [sourceRes, activeRes, threadsRes, artifactsRes, promotionsRes, currentRunRes] = await Promise.all([
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
      pool.query(
        `SELECT ws.thread_id, ws.step_label, ws.detail, ws.created_at, tm.channel_id, m.body AS thread_body
           FROM thread_workflow_steps ws
           JOIN thread_meta tm ON tm.thread_id = ws.thread_id
           LEFT JOIN messages m ON m.id = ws.thread_id
          WHERE tm.repo_id = $1
            AND ws.status = 'running'
          ORDER BY ws.created_at DESC
          LIMIT 1`,
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

    const currentRun = currentRunRes.rows[0]
      ? {
          ...currentRunRes.rows[0],
          thread_title: firstLine(String(currentRunRes.rows[0].thread_body || "")),
        }
      : null;

    const docs = ["WORKSPACE.md", "AIWG.md", "CLAUDE.md", "README.md"]
      .map((name) => readDoc(path.join(repo.path, name)))
      .filter(Boolean);
    const scaffoldDetected =
      existsSync(path.join(repo.path, ".aiwg")) || existsSync(path.join(repo.path, "AIWG.md"));
    const mappedThreads = threadsRes.rows.map((row) => ({
      ...row,
      title: firstLine(String(row.body || "")),
    }));
    const phaseSummary = inferProjectPhase(mappedThreads, scaffoldDetected);

    return NextResponse.json({
      repo: {
        ...repo,
        exists_on_disk: existsSync(repo.path),
        scaffold_detected: scaffoldDetected,
      },
      source_thread: source,
      active_thread: activeThread,
      project_phase: phaseSummary,
      threads: mappedThreads,
      artifacts: artifactsRes.rows.map((row) => ({
        ...row,
        thread_title: firstLine(String(row.thread_body || "")),
      })),
      promotions: promotionsRes.rows.map((row) => ({
        ...row,
        thread_title: firstLine(String(row.thread_body || "")),
      })),
      current_run: currentRun,
      aiwg: {
        docs,
        intake_docs: readIntakeDocs(repo.path),
      },
    });
  } catch (err) {
    console.error("[projects/detail] GET failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
