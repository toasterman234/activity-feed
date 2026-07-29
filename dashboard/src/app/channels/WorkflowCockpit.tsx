"use client";

import {
  LIFECYCLES,
  mainPathOrder,
} from "./lifecycles";
import { requirementStatus } from "./stageReadiness";
import type {
  ActivityEventRow,
  ThreadArtifactRow,
  ThreadMetaRow,
  ThreadPlanRow,
  WorkflowEventRow,
  WorkflowStepRow,
} from "./shapes";

const KIND_TONE: Record<string, string> = {
  start: "border-zinc-300 bg-zinc-100 text-zinc-700",
  active: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  wait: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  proven: "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200",
  done: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  dead: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
};

export function WorkflowCockpit({
  lifecycleKey,
  currentState,
  meta,
  plans,
  artifacts,
  steps,
  activity,
  workflowEvents,
}: {
  lifecycleKey: string;
  currentState: string;
  meta: ThreadMetaRow;
  plans: ThreadPlanRow[];
  artifacts: ThreadArtifactRow[];
  steps: WorkflowStepRow[];
  activity: ActivityEventRow[];
  workflowEvents: WorkflowEventRow[];
}) {
  const lifecycle = LIFECYCLES[lifecycleKey];
  const stage = lifecycle?.states[currentState];
  if (!lifecycle || !stage) return null;

  const path = mainPathOrder(lifecycle);
  const transitioned = new Set(
    workflowEvents
      .filter((event) => event.event_type === "stage.transitioned")
      .map((event) => event.from_state)
      .filter(Boolean),
  );
  const currentIndex = path.indexOf(currentState);
  const activeRun = activity.some((event) => event.status === "running");
  const requirements = stage.requirements || [];
  const completeRequirements = requirements.filter((requirement) =>
    requirementStatus(requirement, currentState, plans, artifacts, steps)
  ).length;
  const stageArtifacts = artifacts.filter((item) => !item.stage_id || item.stage_id === currentState);
  const stagePlans = plans.filter((item) => !item.stage_id || item.stage_id === currentState);
  const openPlans = stagePlans.filter((item) => item.status !== "done");

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-[0_12px_40px_rgba(24,24,27,0.06)] dark:border-zinc-700 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 bg-zinc-950 px-3 py-3 text-zinc-50 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-400">
              {lifecycle.label} workflow · template v{meta.template_version || lifecycle.version}
            </p>
            <h2 className="mt-1 text-base font-semibold tracking-tight">{stage.label}</h2>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-zinc-300">
              {stage.purpose || lifecycle.description}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className={`inline-flex rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-wide ${KIND_TONE[stage.kind] || KIND_TONE.start}`}>
              {activeRun ? "agent running" : stage.terminal ? "complete" : "in progress"}
            </span>
            {meta.stage_started_at && (
              <p className="mt-1 font-mono text-[9px] text-zinc-500">
                since {new Date(meta.stage_started_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
        <div className="flex min-w-max items-center gap-0 overflow-x-auto pb-1">
          {path.map((stateId, index) => {
            const state = lifecycle.states[stateId];
            const isCurrent = stateId === currentState;
            const isDone = transitioned.has(stateId) || (currentIndex >= 0 && index < currentIndex);
            return (
              <div key={stateId} className="flex items-center">
                <div className="flex min-w-24 flex-col items-center">
                  <div className={`grid h-6 w-6 place-items-center rounded-full border font-mono text-[10px] ${
                    isCurrent
                      ? "border-zinc-950 bg-zinc-950 text-white ring-4 ring-zinc-100 dark:border-white dark:bg-white dark:text-zinc-950 dark:ring-zinc-800"
                      : isDone
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                  }`}>
                    {isDone ? "✓" : index + 1}
                  </div>
                  <span className={`mt-1 text-[10px] ${isCurrent ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}`}>
                    {state.label}
                  </span>
                </div>
                {index < path.length - 1 && (
                  <div className={`-mx-4 mb-4 h-px w-8 ${isDone ? "bg-emerald-400" : "bg-zinc-200 dark:bg-zinc-700"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-[1.4fr_1fr]">
        <div className="border-b border-zinc-200 p-3 md:border-b-0 md:border-r dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-400">
              {currentState === "drafting" ? "Plan readiness" : "Ready when"}
            </p>
            {requirements.length > 0 && (
              <span className="font-mono text-[9px] text-zinc-400">{completeRequirements}/{requirements.length}</span>
            )}
          </div>
          {requirements.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              Complete the stage objective, then choose the next transition.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {requirements.map((requirement) => {
                const complete = requirementStatus(requirement, currentState, plans, artifacts, steps);
                return (
                  <li key={requirement.id} className="flex items-start gap-2 text-xs">
                    <span className={`mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] ${
                      complete
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : requirement.source === "approval"
                          ? "border-amber-400 bg-amber-50 text-amber-600"
                          : "border-zinc-300 text-zinc-400 dark:border-zinc-700"
                    }`}>
                      {complete ? "✓" : requirement.source === "approval" ? "!" : ""}
                    </span>
                    <span className={complete ? "text-zinc-400 line-through" : "text-zinc-700 dark:text-zinc-200"}>
                      {requirement.label}
                      {requirement.optional && <span className="ml-1 text-[9px] text-zinc-400">optional</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="p-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-400">Stage pulse</p>
          <dl className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <dt className="font-mono text-[9px] uppercase text-zinc-400">
                {currentState === "drafting" ? "Plan tasks" : "Open tasks"}
              </dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{openPlans.length}</dd>
            </div>
            <div>
              <dt className="font-mono text-[9px] uppercase text-zinc-400">Outputs</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{stageArtifacts.length}</dd>
            </div>
            <div>
              <dt className="font-mono text-[9px] uppercase text-zinc-400">Events</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{workflowEvents.length}</dd>
            </div>
          </dl>
          {stage.outputs && stage.outputs.length > 0 && (
            <div className="mt-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <p className="font-mono text-[9px] uppercase text-zinc-400">Expected outputs</p>
              <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">{stage.outputs.join(" · ")}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
