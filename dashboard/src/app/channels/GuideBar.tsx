"use client";

import { useState } from "react";
import { LIFECYCLES, nextStepSummary, stateKind, type StateKind, type NextStepSummary } from "./lifecycles";

const KIND_DOT: Record<string, string> = {
  start: "bg-zinc-400",
  active: "bg-blue-500",
  wait: "bg-amber-500",
  proven: "bg-teal-500",
  done: "bg-emerald-500",
  dead: "bg-red-500",
};

const KIND_BG: Record<string, string> = {
  start: "bg-zinc-50 border-zinc-200",
  active: "bg-blue-50 border-blue-200",
  wait: "bg-amber-50 border-amber-200",
  proven: "bg-teal-50 border-teal-200",
  done: "bg-emerald-50 border-emerald-200",
  dead: "bg-red-50 border-red-200",
};

const KIND_TEXT: Record<string, string> = {
  start: "text-zinc-600",
  active: "text-blue-700",
  wait: "text-amber-700",
  proven: "text-teal-700",
  done: "text-emerald-700",
  dead: "text-red-700",
};

type GuideBarState =
  | { kind: "active" }
  | { kind: "terminal" }
  | { kind: "working" }
  | { kind: "error"; reason: string };

export function GuideBar({
  lifecycleKey,
  currentState,
  enabledWorkflows,
  channelId,
  threadId,
  onDone,
  onPromote,
}: {
  lifecycleKey: string;
  currentState: string;
  enabledWorkflows: string[];
  channelId: string;
  threadId: string;
  onDone: () => void | Promise<void>;
  onPromote?: () => void;
}) {
  const [barState, setBarState] = useState<GuideBarState>(
    () => LIFECYCLES[lifecycleKey]?.states[currentState]?.terminal
      ? { kind: "terminal" }
      : { kind: "active" },
  );

  const lc = LIFECYCLES[lifecycleKey];
  const summary: NextStepSummary | null = nextStepSummary(lifecycleKey, currentState, enabledWorkflows);
  const kind = stateKind(lifecycleKey, currentState) || "start";

  if (!lc || !summary) return null;

  const chip = (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${KIND_BG[kind] || ""} ${KIND_TEXT[kind] || ""}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${KIND_DOT[kind] || "bg-zinc-400"}`} />
      {summary.stateLabel}
    </span>
  );

  const stepText = summary.onMainPath
    ? `Step ${summary.stepIndex + 1} of ${summary.stepCount}`
    : null;

  const handleAdvance = async () => {
    setBarState({ kind: "working" });
    try {
      const res = await fetch("/api/channels/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, channelId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBarState({ kind: "error", reason: data.error || `Failed (${res.status})` });
        return;
      }
      if (data.terminal) {
        setBarState({ kind: "terminal" });
      } else {
        setBarState({ kind: "active" });
      }
      await onDone();
    } catch (e) {
      setBarState({ kind: "error", reason: String(e) });
    }
  };

  // ── Terminal state ──
  if (barState.kind === "terminal") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800 dark:bg-emerald-950">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{lc.label}</span>
          {chip}
          <span className="text-xs text-emerald-600 dark:text-emerald-400">{summary.stateLabel} — done</span>
          {onPromote && (
            <button
              type="button"
              onClick={onPromote}
              className="ml-auto shrink-0 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-800"
            >
              Promote to project →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Working state ──
  if (barState.kind === "working") {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-800 dark:bg-blue-950">
        <div className="flex items-center gap-2">
          {chip}
          <span className="text-xs text-blue-600 dark:text-blue-400">{summary.nextHint || "Advancing…"}</span>
          <span className="ml-auto animate-spin text-blue-500">⏳</span>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (barState.kind === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-800 dark:bg-red-950">
        <div className="flex items-center gap-2 flex-wrap">
          {chip}
          <span className="text-xs text-red-700 dark:text-red-300">{barState.reason}</span>
          <button
            type="button"
            onClick={() => { void handleAdvance(); }}
            className="ml-auto shrink-0 rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Active state ──
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{lc.label}</span>
        {chip}
        {stepText && (
          <span className="text-[10px] text-zinc-400">
            {stepText}
          </span>
        )}
        {summary.nextHint && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">— {summary.nextHint}</span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => { void handleAdvance(); }}
            className="rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Do it for me
          </button>
        </div>
      </div>
    </div>
  );
}
