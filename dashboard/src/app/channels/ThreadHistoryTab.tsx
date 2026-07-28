"use client";

import { LIFECYCLES } from "./lifecycles";
import { relativeTime, type WorkflowEventRow } from "./shapes";

const EVENT_LABELS: Record<string, string> = {
  "workflow.created": "Workflow created",
  "workflow.template_changed": "Template changed",
  "stage.transitioned": "Stage changed",
  "stage.gate_failed": "Gate failed",
  "workflow.completed": "Workflow completed",
};

export function ThreadHistoryTab({ events }: { events: WorkflowEventRow[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
        Workflow history will appear here as the thread advances.
      </div>
    );
  }

  return (
    <ol className="rounded-lg border border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900">
      {[...events].reverse().map((event, index) => {
        const lifecycle = LIFECYCLES[event.template_id];
        const from = event.from_state ? lifecycle?.states[event.from_state]?.label || event.from_state : null;
        const to = event.to_state ? lifecycle?.states[event.to_state]?.label || event.to_state : null;
        return (
          <li key={event.id} className="relative flex gap-3 border-b border-zinc-100 py-3 last:border-0 dark:border-zinc-800">
            <div className="relative mt-1">
              <span className={`block h-2.5 w-2.5 rounded-full ${
                event.event_type === "stage.gate_failed" ? "bg-red-500" :
                event.event_type === "workflow.completed" ? "bg-emerald-500" : "bg-zinc-400"
              }`} />
              {index < events.length - 1 && <span className="absolute left-[4px] top-3 h-[calc(100%+14px)] w-px bg-zinc-200 dark:bg-zinc-700" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                  {EVENT_LABELS[event.event_type] || event.event_type}
                </p>
                <span className="font-mono text-[9px] uppercase text-zinc-400">{relativeTime(event.created_at)}</span>
              </div>
              {(from || to) && (
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {from && <span>{from}</span>}
                  {from && to && <span className="mx-1.5 text-zinc-300">→</span>}
                  {to && <span className="font-medium text-zinc-700 dark:text-zinc-300">{to}</span>}
                </p>
              )}
              <p className="mt-0.5 font-mono text-[9px] text-zinc-400">
                {event.actor} · {event.template_id}@{event.template_version}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
