"use client";

import { useState } from "react";
import {
  LIFECYCLES,
  nextStepSummary,
  stateKind,
  type NextStepSummary,
} from "./lifecycles";
import { stageReadiness } from "./stageReadiness";
import { advanceThread } from "./advanceThread";
import type { ThreadArtifactRow, ThreadPlanRow, WorkflowStepRow } from "./shapes";

const CONFIRM_KINDS = new Set(["done", "dead", "proven"]);

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

type BarState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; reason: string; retry: () => void };

export function StageActionBar({
  lifecycleKey,
  currentState,
  enabledWorkflows,
  channelId,
  threadId,
  isArchived,
  plans,
  artifacts,
  steps,
  onDone,
  onPromote,
  onScrollToExecution,
}: {
  lifecycleKey: string;
  currentState: string;
  enabledWorkflows: string[];
  channelId: string;
  threadId: string;
  isArchived?: boolean;
  plans: ThreadPlanRow[];
  artifacts: ThreadArtifactRow[];
  steps: WorkflowStepRow[];
  onDone: () => void | Promise<void>;
  onPromote?: () => void;
  onScrollToExecution?: () => void;
}) {
  const [barState, setBarState] = useState<BarState>({ kind: "idle" });

  const lc = LIFECYCLES[lifecycleKey];
  const summary: NextStepSummary | null = nextStepSummary(lifecycleKey, currentState, enabledWorkflows);
  const kind = stateKind(lifecycleKey, currentState) || "start";

  if (isArchived) return null;
  if (!lc || !summary) return null;

  const chip = (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${KIND_BG[kind] || ""} ${KIND_TEXT[kind] || ""}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${KIND_DOT[kind] || "bg-zinc-400"}`} />
      {summary.stateLabel}
    </span>
  );

  const stepText = summary.onMainPath
    ? `Step ${summary.stepIndex + 1} of ${summary.stepCount}`
    : null;

  const legalNext = summary.legalNextStates;
  const mainNext =
    legalNext.find((to) => {
      const candidate = lc.states[to];
      return candidate && candidate.kind !== "dead";
    }) || legalNext[0];
  const nextLabel = mainNext ? (lc.states[mainNext]?.label || mainNext) : null;

  const hasPromptAtNext = !!(
    mainNext &&
    Object.entries(lc.workflows).some(([wfId, wf]) =>
      wf.kind === "prompt" &&
      wf.runsAt === mainNext &&
      enabledWorkflows.includes(wfId)
    )
  );

  const { incompleteLabels } = stageReadiness(lifecycleKey, currentState, plans, artifacts, steps);

  const runAgentAdvance = async () => {
    setBarState({ kind: "working" });
    const result = await advanceThread({ threadId, channelId, mode: "agent" });
    if (!result.ok) {
      setBarState({
        kind: "error",
        reason: result.error || "Failed",
        retry: () => { void runAgentAdvance(); },
      });
      return;
    }
    setBarState({ kind: "idle" });
    await onDone();
  };

  const transitionTo = async (toState: string) => {
    const target = lc.states[toState];
    if (target && CONFIRM_KINDS.has(target.kind)) {
      const label = target.label || toState;
      if (!window.confirm(`Move thread to "${label}"?`)) return;
    }
    setBarState({ kind: "working" });
    const result = await advanceThread({ threadId, channelId, mode: "transition", toState });
    if (!result.ok) {
      setBarState({
        kind: "error",
        reason: result.error || "Failed",
        retry: () => { void transitionTo(toState); },
      });
      return;
    }
    setBarState({ kind: "idle" });
    await onDone();
  };

  const secondaryStates = mainNext
    ? legalNext.filter((to) => to !== mainNext)
    : legalNext;

  if (barState.kind === "working") {
    return (
      <div id="stage-action-bar" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-800 dark:bg-blue-950">
        <div className="flex items-center gap-2">
          {chip}
          <span className="text-xs text-blue-600 dark:text-blue-400">{summary.nextHint || "Working…"}</span>
          <span className="ml-auto animate-pulse text-[11px] text-blue-500">Working…</span>
        </div>
      </div>
    );
  }

  if (barState.kind === "error") {
    return (
      <div id="stage-action-bar" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-800 dark:bg-red-950">
        <div className="flex flex-wrap items-center gap-2">
          {chip}
          <span className="text-xs text-red-700 dark:text-red-300">{barState.reason}</span>
          <button
            type="button"
            onClick={barState.retry}
            className="ml-auto shrink-0 rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Terminal
  if (summary.isTerminal) {
    const isAcceptedPlan = lifecycleKey === "planning" && currentState === "accepted";
    const primaryExecute = isAcceptedPlan && onScrollToExecution;
    const primaryPromote = !primaryExecute && onPromote;

    return (
      <div id="stage-action-bar" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800 dark:bg-emerald-950">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{lc.label}</span>
          {chip}
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            {isAcceptedPlan ? "Approved — hand off to execution" : `${summary.stateLabel} — done`}
          </span>
          {primaryExecute && (
            <button
              type="button"
              onClick={onScrollToExecution}
              className="ml-auto shrink-0 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-800"
            >
              Execute plan
            </button>
          )}
          {primaryPromote && (
            <button
              type="button"
              onClick={onPromote}
              className="ml-auto shrink-0 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-800"
            >
              Promote to project
            </button>
          )}
        </div>
      </div>
    );
  }

  const primaryLabel = hasPromptAtNext
    ? "Run agent & advance"
    : nextLabel
      ? `Advance to ${nextLabel}`
      : "Advance";

  const advanceBlocked = incompleteLabels.length > 0;
  const primaryEnabled = !advanceBlocked && (hasPromptAtNext || !!mainNext);

  const onPrimary = () => {
    if (!primaryEnabled) return;
    if (hasPromptAtNext) {
      void runAgentAdvance();
      return;
    }
    if (mainNext) void transitionTo(mainNext);
  };

  return (
    <div id="stage-action-bar" className="space-y-1.5">
      <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{lc.label}</span>
          {chip}
          {stepText && <span className="text-[10px] text-zinc-400">{stepText}</span>}
          {summary.nextHint && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">— {summary.nextHint}</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPrimary}
              disabled={!primaryEnabled}
              title={advanceBlocked ? `Blocked until: ${incompleteLabels.join(", ")}` : undefined}
              className="rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              {primaryLabel}
            </button>
          </div>
        </div>
        {incompleteLabels.length > 0 && (
          <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
            Blocked until: {incompleteLabels.join(", ")}
          </p>
        )}
      </div>

      {secondaryStates.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-0.5">
          {secondaryStates.map((toState) => {
            const label = lc.states[toState]?.label || toState;
            const sk = lc.states[toState]?.kind;
            const danger = sk === "dead";
            return (
              <button
                key={toState}
                type="button"
                onClick={() => { void transitionTo(toState); }}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                  danger
                    ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                → {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
