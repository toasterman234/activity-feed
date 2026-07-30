"use client";

import { useState } from "react";
import { LIFECYCLES } from "./lifecycles";
import { advanceThread } from "./advanceThread";
import type { WorkflowStepRow } from "./shapes";

interface VerificationWorkspaceProps {
  threadId: string;
  channelId: string;
  lifecycleKey: string;
  currentState: string;
  enabledWorkflows: string[];
  steps: WorkflowStepRow[];
  onRefresh: () => Promise<void>;
  isArchived?: boolean;
}

export function VerificationWorkspace({
  threadId,
  channelId,
  lifecycleKey,
  currentState,
  enabledWorkflows,
  steps,
  onRefresh,
  isArchived,
}: VerificationWorkspaceProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lc = LIFECYCLES[lifecycleKey];
  const workflows = lc?.workflows || {};

  // Gather gated workflows that run on this state
  const checkWorkflows = Object.entries(workflows)
    .filter(([, wf]) => wf.runsAt === currentState && wf.kind === "command")
    .map(([id, wf]) => ({ id, ...wf }));

  // Find the most recent step result for each workflow
  const latestStepByWorkflow = new Map<string, WorkflowStepRow>();
  for (const step of steps) {
    for (const wf of checkWorkflows) {
      if (
        step.step_label?.toLowerCase().includes(wf.id.toLowerCase()) ||
        step.step_label?.toLowerCase().includes(wf.label.toLowerCase())
      ) {
        const existing = latestStepByWorkflow.get(wf.id);
        if (!existing || step.created_at > existing.created_at) {
          latestStepByWorkflow.set(wf.id, step);
        }
      }
    }
  }

  const allDone = checkWorkflows.length > 0 && checkWorkflows.every((wf) => {
    const step = latestStepByWorkflow.get(wf.id);
    return step && step.status === "done";
  });

  const runChecks = async () => {
    setBusy(true);
    setError(null);
    const result = await advanceThread({ threadId, channelId, mode: "agent" });
    if (!result.ok) {
      setError(result.error || "Failed");
    }
    setBusy(false);
    await onRefresh();
  };

  if (isArchived) return null;
  if (checkWorkflows.length === 0) return null;

  return (
    <section className="rounded-xl border border-teal-200 bg-card p-3 shadow-[0_10px_30px_rgba(24,24,27,0.05)] dark:border-teal-800 dark:bg-zinc-900">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-teal-600 dark:text-teal-400">
        Coding · verification workspace
      </p>
      <h3 className="mt-1 text-base font-semibold">Verify the change</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        Run the configured checks below to validate the implementation before review.
      </p>

      <ul className="mt-3 space-y-2">
        {checkWorkflows.map((wf) => {
          const step = latestStepByWorkflow.get(wf.id);
          const status = step?.status;
          const isDone = status === "done";
          const isRunning = status === "running";
          const isError = status === "error";
          return (
            <li
              key={wf.id}
              className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${
                isDone
                  ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20"
                  : isError
                    ? "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20"
                    : isRunning
                      ? "border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/20"
                      : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <span className={`shrink-0 text-sm ${isDone ? "text-emerald-500" : isError ? "text-red-500" : isRunning ? "animate-pulse text-blue-500" : "text-zinc-300"}`}>
                {isDone ? "✓" : isError ? "✕" : isRunning ? "●" : "○"}
              </span>
              <span className="flex-1 font-medium">{wf.label}</span>
              {step?.detail && (
                <span className="text-[10px] text-zinc-400 truncate max-w-[150px]">{step.detail}</span>
              )}
              {step?.created_at && (
                <span className="text-[10px] text-zinc-400 shrink-0">
                  {new Date(step.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { void runChecks(); }}
          disabled={busy}
          className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {busy ? "Running checks…" : "Run checks"}
        </button>

        {allDone && (
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            Ready — use Advance to Review above
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
