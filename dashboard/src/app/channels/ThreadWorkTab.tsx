"use client";

import { relativeTime, type ActivityEventRow, type ThreadPlanRow, type WorkflowStepRow } from "./shapes";
import { WorkRunsPanel } from "./WorkRunsPanel";

export type ThreadWorkTabProps = {
  threadId: string;
  plans: ThreadPlanRow[];
  steps: WorkflowStepRow[];
  runEvents: ActivityEventRow[];
  latestEvent: ActivityEventRow | null;
  activityRunning: boolean;
  currentStateLabel: string;
  planningStage: boolean;
  onTogglePlanStatus: (plan: ThreadPlanRow) => void | Promise<void>;
};

export function ThreadWorkTab({
  threadId,
  plans,
  steps,
  runEvents,
  latestEvent,
  activityRunning,
  currentStateLabel,
  planningStage,
  onTogglePlanStatus,
}: ThreadWorkTabProps) {
  return (
    <div className="space-y-3">
      <WorkRunsPanel threadId={threadId} />

      {plans.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Execution plan</p>
            {planningStage && <p className="mt-1 text-[11px] text-zinc-500">These are proposed steps. Completion tracking begins after the plan is approved.</p>}
          </div>
          <ul className="space-y-1">
            {plans.map((plan, index) => (
              <li key={plan.id}>
                <button disabled={planningStage} onClick={() => { void onTogglePlanStatus(plan); }} className="flex w-full items-start gap-2 text-left text-xs disabled:cursor-default">
                  <span className={`mt-0.5 shrink-0 px-1 text-[10px] ${planningStage ? "font-mono text-zinc-400" : plan.status === "done" ? "rounded border border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" : "rounded border border-zinc-300 text-zinc-400 dark:border-zinc-700"}`}>
                    {planningStage ? `${index + 1}.` : plan.status === "done" ? "✓" : " "}
                  </span>
                  <span className={!planningStage && plan.status === "done" ? "text-zinc-400 line-through" : "text-zinc-600 dark:text-zinc-300"}>{plan.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {latestEvent && (activityRunning || latestEvent.status === "error") && (
        <details className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900" open={activityRunning}>
          <summary className="flex cursor-pointer items-center gap-2 text-xs">
            <span className={activityRunning ? "animate-pulse text-amber-500" : latestEvent.status === "error" ? "text-red-500" : "text-emerald-500"}>
              {activityRunning ? "●" : latestEvent.status === "error" ? "✕" : "✓"}
            </span>
            <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-300">{latestEvent.label}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-400">{relativeTime(latestEvent.updated_at || latestEvent.created_at)}</span>
          </summary>
          <ul className="mt-2 space-y-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
            {runEvents.map((event) => (
              <li key={event.id} className="flex items-start gap-2 text-xs">
                <span className={event.status === "done" ? "text-emerald-500" : event.status === "error" ? "text-red-500" : event.status === "running" ? "animate-pulse text-amber-500" : "text-zinc-400"}>
                  {event.kind === "thinking" ? "✎" : event.kind === "tool" ? "⚙" : event.status === "error" ? "✕" : "●"}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-zinc-600 dark:text-zinc-300">{event.label}</span>
                  {event.detail && (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[10px] text-zinc-400">
                      {event.detail.length > 400 ? `${event.detail.slice(0, 400)}…` : event.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!activityRunning && latestEvent?.status !== "error" && (
        <p className="px-1 text-[11px] text-zinc-400">No agent is running. Current stage: {currentStateLabel}.</p>
      )}
    </div>
  );
}
