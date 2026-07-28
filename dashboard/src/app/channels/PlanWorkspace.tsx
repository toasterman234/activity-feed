"use client";

import { useMemo, useState } from "react";
import type { ThreadPlanRow } from "./shapes";

function parseStringList(value: string): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function PlanWorkspace({
  threadId,
  channelId,
  stageId,
  plans,
  onRefresh,
}: {
  threadId: string;
  channelId: string;
  stageId: string;
  plans: ThreadPlanRow[];
  onRefresh: () => Promise<void>;
}) {
  const ordered = useMemo(
    () => [...plans].filter((plan) => !plan.stage_id || plan.stage_id === stageId)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [plans, stageId],
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [criteriaDrafts, setCriteriaDrafts] = useState<Record<string, string>>({});
  const [dependencyDrafts, setDependencyDrafts] = useState<Record<string, string>>({});
  const [newTask, setNewTask] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = ordered.length >= 2 && ordered.every((plan) => plan.title.trim().length >= 8);

  const mutate = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/channels/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, threadId, channelId, stageId, ...payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      await onRefresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const advance = async () => {
    setBusy("advance");
    setError(null);
    try {
      const response = await fetch("/api/channels/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, channelId, toState: "review", actor: "you" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-sky-300 bg-white p-3 shadow-[0_10px_30px_rgba(24,24,27,0.05)] dark:border-sky-800 dark:bg-zinc-900">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">Your next action</p>
      <h3 className="mt-1 text-base font-semibold">Make the execution plan concrete</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        Edit, add, remove, or reorder the tasks below. These are plan steps—not completed work—so they stay unchecked until execution begins.
      </p>

      <ol className="mt-3 space-y-2">
        {ordered.map((plan, index) => {
          const title = drafts[plan.id] ?? plan.title;
          const criteria = criteriaDrafts[plan.id] ?? parseStringList(plan.acceptance_criteria).join("\n");
          const dependencies = dependencyDrafts[plan.id] ?? parseStringList(plan.dependencies).join(", ");
          return (
            <li key={plan.id} className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-100 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800">{index + 1}</span>
                <input
                  value={title}
                  onChange={(event) => setDrafts((current) => ({ ...current, [plan.id]: event.target.value }))}
                  onBlur={() => {
                    if (title.trim() && title.trim() !== plan.title) void mutate("update", { id: plan.id, title: title.trim() });
                  }}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  aria-label={`Plan task ${index + 1}`}
                />
                <button disabled={index === 0 || busy !== null} onClick={() => { void mutate("move", { id: plan.id, direction: -1 }); }} className="px-1 text-zinc-400 disabled:opacity-20" aria-label="Move task up">↑</button>
                <button disabled={index === ordered.length - 1 || busy !== null} onClick={() => { void mutate("move", { id: plan.id, direction: 1 }); }} className="px-1 text-zinc-400 disabled:opacity-20" aria-label="Move task down">↓</button>
                <button disabled={busy !== null} onClick={() => { void mutate("delete", { id: plan.id }); }} className="px-1 text-zinc-400 hover:text-red-500" aria-label="Remove task">×</button>
              </div>
              <details className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800" open={!criteria.trim()}>
                <summary className="cursor-pointer text-[11px] font-medium text-zinc-500">
                  Definition of done · {lines(criteria).length} criteria · {lines(dependencies.replaceAll(",", "\n")).length} dependencies
                </summary>
                <div className="mt-2 grid gap-2 md:grid-cols-[1fr_14rem]">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                    Acceptance criteria · one per line
                    <textarea
                      value={criteria}
                      onChange={(event) => setCriteriaDrafts((current) => ({ ...current, [plan.id]: event.target.value }))}
                      onBlur={() => {
                        const next = lines(criteria);
                        if (JSON.stringify(next) !== JSON.stringify(parseStringList(plan.acceptance_criteria))) {
                          void mutate("update", { id: plan.id, title: title.trim(), acceptanceCriteria: next });
                        }
                      }}
                      rows={Math.max(2, Math.min(5, lines(criteria).length))}
                      className="mt-1 w-full rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-xs normal-case tracking-normal outline-none dark:border-zinc-700"
                    />
                  </label>
                  <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                    Depends on steps
                    <input
                      value={dependencies}
                      onChange={(event) => setDependencyDrafts((current) => ({ ...current, [plan.id]: event.target.value }))}
                      onBlur={() => {
                        const next = dependencies.split(",").map((item) => item.trim()).filter(Boolean);
                        if (JSON.stringify(next) !== JSON.stringify(parseStringList(plan.dependencies))) {
                          void mutate("update", { id: plan.id, title: title.trim(), dependencies: next });
                        }
                      }}
                      placeholder="1, 2"
                      className="mt-1 w-full rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-xs normal-case tracking-normal outline-none dark:border-zinc-700"
                    />
                  </label>
                </div>
              </details>
            </li>
          );
        })}
      </ol>

      <div className="mt-2 flex gap-2">
        <input value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="Add the next concrete task…" className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
        <button
          disabled={!newTask.trim() || busy !== null}
          onClick={async () => {
            if (await mutate("add", { title: newTask.trim() })) setNewTask("");
          }}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium disabled:opacity-40 dark:border-zinc-700"
        >
          Add
        </button>
      </div>

      <div className={`mt-3 rounded-lg border p-3 ${ready ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40"}`}>
        <p className="text-xs font-medium">{ready ? "Plan is ready to challenge" : `Add ${Math.max(0, 2 - ordered.length)} more concrete task${ordered.length === 1 ? "" : "s"} to continue`}</p>
        <p className="mt-1 text-[11px] text-zinc-500">{ready ? "The next stage will check risks, dependencies, and weak assumptions." : "Use action-oriented tasks with a clear result. You can reorder them with the arrows."}</p>
        <button disabled={!ready || busy !== null} onClick={() => { void advance(); }} className="mt-2 w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 sm:w-auto">
          {busy === "advance" ? "Moving…" : "Challenge this plan →"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
