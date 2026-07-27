"use client";

import { useCallback, useEffect, useState } from "react";

type WorkRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "interrupted"
  | "cancelled";

type WorkRun = {
  id: string;
  attempt: number;
  max_attempts: number;
  status: WorkRunStatus;
  agent_registry_id: string;
  model: string | null;
  config_hash: string;
  error_detail: string | null;
  cancel_requested_at: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type WorkRunCheck = {
  id: string;
  run_id: string;
  label: string;
  required: boolean;
  status: "running" | "passed" | "failed" | "skipped";
  output_excerpt: string | null;
};

const STATUS_STYLE: Record<WorkRunStatus, string> = {
  queued: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  running: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  succeeded: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  interrupted: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300",
  cancelled: "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
};

function elapsed(run: WorkRun): string {
  const start = new Date(run.started_at || run.created_at).getTime();
  const end = run.completed_at ? new Date(run.completed_at).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return seconds < 3600 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function WorkRunsPanel({ threadId }: { threadId: string }) {
  const [runs, setRuns] = useState<WorkRun[]>([]);
  const [checks, setChecks] = useState<WorkRunCheck[]>([]);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/work-runs?threadId=${encodeURIComponent(threadId)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load attempts");
      setRuns(Array.isArray(payload.runs) ? payload.runs : []);
      setChecks(Array.isArray(payload.checks) ? payload.checks : []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load attempts");
    }
  }, [threadId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function act(action: "cancel" | "retry", runId: string) {
    setActing(`${action}:${runId}`);
    try {
      const response = await fetch("/api/work-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, runId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not update attempt");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update attempt");
    } finally {
      setActing(null);
    }
  }

  if (!runs.length && !error) return null;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Execution attempts</p>
          <p className="mt-1 text-[11px] text-zinc-500">Durable run history, recovery, and retry controls.</p>
        </div>
        <button type="button" onClick={() => { void load(); }} className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          Refresh
        </button>
      </div>

      {error && <p role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <ol className="mt-3 space-y-2">
        {runs.map((run) => {
          const runChecks = checks.filter((check) => check.run_id === run.id);
          const canCancel = run.status === "queued" || (run.status === "running" && !run.cancel_requested_at);
          const canRetry = (run.status === "failed" || run.status === "interrupted") && run.attempt < run.max_attempts;
          return (
            <li key={run.id} className="rounded-md border border-zinc-100 p-2.5 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[run.status]}`}>
                  {run.cancel_requested_at && run.status === "running" ? "stopping" : run.status}
                </span>
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                  {run.agent_registry_id.replace("agent:", "")}
                </span>
                <span className="text-[10px] text-zinc-400">attempt {run.attempt}/{run.max_attempts}</span>
                <span className="ml-auto text-[10px] tabular-nums text-zinc-400">{elapsed(run)}</span>
              </div>
              <p className="mt-1 truncate text-[10px] text-zinc-400">
                {run.model || "default model"} · config {run.config_hash.slice(0, 8)}
              </p>
              {run.error_detail && <p className="mt-1 whitespace-pre-wrap break-words text-[11px] text-red-600 dark:text-red-400">{run.error_detail}</p>}
              {runChecks.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                  {runChecks.map((check) => (
                    <li key={check.id} className="flex items-start gap-2 text-[10px]">
                      <span className={check.status === "passed" ? "text-emerald-500" : check.status === "failed" ? "text-red-500" : "text-amber-500"}>
                        {check.status === "passed" ? "✓" : check.status === "failed" ? "✕" : "●"}
                      </span>
                      <details className="min-w-0 flex-1">
                        <summary className="cursor-pointer text-zinc-500 dark:text-zinc-300">{check.label}{check.required ? "" : " (optional)"}</summary>
                        {check.output_excerpt && <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] text-zinc-400">{check.output_excerpt}</pre>}
                      </details>
                    </li>
                  ))}
                </ul>
              )}
              {(canCancel || canRetry) && (
                <div className="mt-2 flex gap-2">
                  {canCancel && (
                    <button type="button" disabled={acting !== null} onClick={() => { void act("cancel", run.id); }} className="rounded border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300">
                      {run.status === "running" ? "Request stop" : "Cancel"}
                    </button>
                  )}
                  {canRetry && (
                    <button type="button" disabled={acting !== null} onClick={() => { void act("retry", run.id); }} className="rounded border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300">
                      Queue retry
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
