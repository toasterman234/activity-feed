"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ThreadPlanRow } from "./shapes";
import type { ThreadMetaRow } from "./shapes";

function planList(value: string): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function CodingExecutionWorkspace({
  threadId,
  channelId,
  meta,
  plans,
  currentState,
  onRefresh,
}: {
  threadId: string;
  channelId: string;
  meta: ThreadMetaRow;
  plans: ThreadPlanRow[];
  currentState: string;
  onRefresh: () => Promise<void>;
}) {
  const [repoName, setRepoName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const isRunning = currentState === "running";

  useEffect(() => {
    if (!meta.repo_id) return;
    fetch("/api/repos", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const repo = (data.repos || []).find((r: { id: string; name: string }) => r.id === meta.repo_id);
        setRepoName(repo?.name || null);
      })
      .catch(() => {});
  }, [meta.repo_id]);
  const orderedPlans = useMemo(
    () => [...plans].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [plans],
  );

  const advance = async () => {
    setBusy(true);
    setAdvanceError(null);
    try {
      const res = await fetch("/api/channels/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, channelId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Advance failed (${res.status})`);
      await onRefresh();
    } catch (err) {
      setAdvanceError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const sourcePlanThreadId = (() => {
    try {
      const labels = JSON.parse(meta.labels || "[]");
      const label = labels.find((l: string) => l.startsWith("source-plan:"));
      return label ? label.replace("source-plan:", "") : null;
    } catch {
      return null;
    }
  })();

  if (isRunning) {
    return (
      <section className="rounded-xl border border-sky-200 bg-sky-50/40 p-3 dark:border-sky-800 dark:bg-sky-950/30">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">Coding · implementation in progress</p>
        <h3 className="mt-1 text-base font-semibold">Agent working on this plan</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          {meta.repo_id
            ? `Targeting ${repoName || "linked repository"}. Agent: @${meta.assignee || "pi"}.`
            : "No repository linked."}
        </p>

        {sourcePlanThreadId && (
          <p className="mt-1 text-[11px] text-zinc-400">
            Linked from{" "}
            <Link
              href={`/channels/${meta.channel_id}/${sourcePlanThreadId}`}
              className="underline hover:text-blue-600"
            >
              approved plan
            </Link>
          </p>
        )}

        <details className="mt-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800" open={orderedPlans.length <= 5}>
          <summary className="cursor-pointer text-xs font-medium">Execution plan · {orderedPlans.length} tasks</summary>
          <ol className="mt-2 space-y-1">
            {orderedPlans.map((plan, index) => {
              const criteria = planList(plan.acceptance_criteria);
              return (
                <li key={plan.id} className="flex gap-2 rounded-md p-1.5 text-[11px] leading-5">
                  <span className={`mt-0.5 shrink-0 px-1 text-[10px] ${
                    plan.status === "done"
                      ? "rounded border border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                      : "font-mono text-zinc-400"
                  }`}>
                    {plan.status === "done" ? "✓" : `${index + 1}.`}
                  </span>
                  <div className="min-w-0">
                    <span className={plan.status === "done" ? "text-zinc-400 line-through" : "text-zinc-600 dark:text-zinc-300"}>
                      {plan.title}
                    </span>
                    {criteria.length > 0 && (
                      <ul className="mt-0.5 text-[10px] text-zinc-400">
                        {criteria.map((c) => <li key={c}>✓ {c}</li>)}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </details>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/channels/${channelId}/${threadId}?tab=work`}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium dark:border-zinc-700"
          >
            See work tab
          </Link>
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">
          The agent is in progress. Use the Stage Action Bar above to advance when ready, or check the Work tab for live activity.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-sky-300 bg-white p-3 shadow-[0_10px_30px_rgba(24,24,27,0.05)] dark:border-sky-800 dark:bg-zinc-900">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">Coding · ready to implement</p>
      <h3 className="mt-1 text-base font-semibold">Execute the approved plan</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        {meta.repo_id
          ? `Targeting ${repoName || "linked repository"}. Agent: @${meta.assignee || "pi"}.`
          : "No repository linked yet. Link one first from the Overview tab."}
      </p>

      {sourcePlanThreadId && (
        <p className="mt-1 text-[11px] text-zinc-400">
          Linked from{" "}
          <Link
            href={`/channels/${meta.channel_id}/${sourcePlanThreadId}`}
            className="underline hover:text-blue-600"
          >
            approved plan
          </Link>
        </p>
      )}

      <details className="mt-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800" open={orderedPlans.length <= 5}>
        <summary className="cursor-pointer text-xs font-medium">Execution plan · {orderedPlans.length} tasks</summary>
        <ol className="mt-2 space-y-1">
          {orderedPlans.map((plan, index) => {
            const criteria = planList(plan.acceptance_criteria);
            return (
              <li key={plan.id} className="flex gap-2 rounded-md p-1.5 text-[11px] leading-5">
                <span className={`mt-0.5 shrink-0 px-1 text-[10px] ${
                  plan.status === "done"
                    ? "rounded border border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                    : "font-mono text-zinc-400"
                }`}>
                  {plan.status === "done" ? "✓" : `${index + 1}.`}
                </span>
                <div className="min-w-0">
                  <span className={plan.status === "done" ? "text-zinc-400 line-through" : "text-zinc-600 dark:text-zinc-300"}>
                    {plan.title}
                  </span>
                  {criteria.length > 0 && (
                    <ul className="mt-0.5 text-[10px] text-zinc-400">
                      {criteria.map((c) => <li key={c}>✓ {c}</li>)}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </details>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => { void advance(); }}
          disabled={busy}
          className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
        >
          {busy ? "Starting agent…" : "Start implementing →"}
        </button>
        <Link
          href={`/channels/${channelId}/${threadId}?tab=work`}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium dark:border-zinc-700"
        >
          See work tab
        </Link>
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        {busy
          ? "Running the agent now — this may take a moment. Check the Work tab for live activity."
          : `Hitting start advances the thread to Implement and runs the agent with these ${orderedPlans.length} tasks as its guide. Toggle tasks on/off in the Work tab as the agent completes them.`}
      </p>
      {advanceError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{advanceError}</p>}
    </section>
  );
}
