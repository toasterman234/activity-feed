"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ThreadPromotionRow } from "./shapes";

const STAGES = [
  { match: /start|queue/i, label: "Starting" },
  { match: /scaffold/i, label: "Scaffolding AIWG project" },
  { match: /fill|template|AI/i, label: "Filling templates with AI" },
  { match: /required|check|Blocked/i, label: "Checking required sections" },
  { match: /commit|writ/i, label: "Writing & committing" },
  { match: /sav|dest/i, label: "Saving to destination" },
  { match: /done|Failed/i, label: "Done" },
] as const;

function stageIndex(progress: string | null | undefined, status: string): number {
  if (status === "succeeded") return STAGES.length - 1;
  if (!progress) return 0;
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (STAGES[i].match.test(progress)) return i;
  }
  return 0;
}

export function PromoteStatusPanel({
  promotion,
  promotedTo,
  repoId,
  onRetry,
  onEditPath,
  onDismiss,
  onPromoteClick,
  showPromoteButton,
  promoteAnywayHint,
  retrying,
}: {
  promotion: ThreadPromotionRow | null;
  promotedTo: string | null;
  repoId?: string | null;
  onRetry: () => void;
  onEditPath: () => void;
  onDismiss: () => void;
  onPromoteClick: () => void;
  showPromoteButton: boolean;
  promoteAnywayHint?: ReactNode;
  retrying?: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [startingWork, setStartingWork] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const status = promotion?.status;
  const isRunning = status === "running" || !!retrying;
  const isFailed = !retrying && (status === "errored" || status === "failed_required_gate");
  const isSucceeded = status === "succeeded" || !!promotedTo;
  const path = promotion?.repo_path || promotedTo;
  const idx = stageIndex(promotion?.progress, status || "");

  if (isSucceeded && path) {
    const projectName = path.split("/").filter(Boolean).pop() || "project";
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950">
        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
          ✓ Promoted to project
        </p>
        <p className="mt-1 text-sm font-medium text-emerald-800 dark:text-emerald-100">
          {projectName}
        </p>
        <p className="mt-0.5 break-all font-mono text-[10px] text-emerald-700/80 dark:text-emerald-300/70">
          {path}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {repoId && (
            <button
              type="button"
              disabled={startingWork}
              onClick={() => {
                setStartingWork(true);
                setWorkError(null);
                void fetch("/api/projects/work", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ repoId }),
                })
                  .then(async (res) => {
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                    router.push(String(data.url));
                  })
                  .catch((e) => {
                    setWorkError(String(e));
                    setStartingWork(false);
                  });
              }}
              className="rounded border border-emerald-300 bg-emerald-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:border-emerald-700"
            >
              {startingWork ? "Opening…" : "Start working"}
            </button>
          )}
          <a
            href="/projects"
            className="rounded border border-emerald-300 bg-white px-2 py-1 text-[10px] font-medium text-emerald-700 dark:border-emerald-700 dark:bg-zinc-900 dark:text-emerald-300"
          >
            View in Projects
          </a>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(path);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch { /* ignore */ }
            }}
            className="rounded border border-emerald-300 bg-white px-2 py-1 text-[10px] font-medium text-emerald-700 dark:border-emerald-700 dark:bg-zinc-900 dark:text-emerald-300"
          >
            {copied ? "Copied" : "Copy path"}
          </button>
        </div>
        {workError && <p className="mt-1 text-[10px] text-red-500">{workError}</p>}
        <p className="mt-2 text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
          Registered in the app. Start working opens an Issues thread in this repo.
        </p>
      </div>
    );
  }

  if (isRunning) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Promoting…
          </p>
        </div>
        <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-300">
          {retrying && status !== "running"
            ? "Starting retry…"
            : (promotion?.progress || "Starting…")}
        </p>
        <ol className="space-y-1">
          {STAGES.slice(0, -1).map((s, i) => {
            const done = i < idx;
            const current = i === idx;
            return (
              <li
                key={s.label}
                className={`flex items-center gap-2 text-[11px] ${
                  current
                    ? "font-medium text-amber-900 dark:text-amber-100"
                    : done
                      ? "text-amber-700/70 dark:text-amber-300/70"
                      : "text-amber-700/40 dark:text-amber-300/40"
                }`}
              >
                <span className="w-3 shrink-0 text-center">
                  {done ? "✓" : current ? "●" : "○"}
                </span>
                {s.label}
                {current && <span className="text-[10px] opacity-70">(now)</span>}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[10px] text-amber-600/80 dark:text-amber-400/80">
          Safe to leave this screen — progress keeps updating.
        </p>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
        <p className="text-xs font-semibold text-red-700 dark:text-red-300">
          {status === "failed_required_gate"
            ? "Incomplete — required sections unfilled"
            : "Promotion failed"}
        </p>
        {promotion?.progress && (
          <p className="mt-0.5 text-[10px] text-red-500">{promotion.progress}</p>
        )}
        {promotion?.error_detail && (
          <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-[10px] text-red-600 dark:text-red-400">
            {promotion.error_detail.length > 500
              ? promotion.error_detail.slice(0, 500) + "…"
              : promotion.error_detail}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded border border-red-300 bg-red-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-red-700 dark:border-red-700"
          >
            Retry now
          </button>
          <button
            type="button"
            onClick={onEditPath}
            className="rounded border border-red-300 bg-white px-2 py-1 text-[10px] text-red-600 dark:border-red-700 dark:bg-zinc-800 dark:text-red-400"
          >
            Edit path…
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-zinc-200 bg-white px-2 py-1 text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (showPromoteButton) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={onPromoteClick}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
          <span className="text-sm">↑</span>
          Promote to Project
        </button>
        {promoteAnywayHint}
      </div>
    );
  }

  return promoteAnywayHint ? <>{promoteAnywayHint}</> : null;
}
