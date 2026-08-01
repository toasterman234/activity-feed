"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cx } from "@/components/ui";
import type { ActivityEventRow } from "./shapes";
import { relativeTime } from "./shapes";

export type ThinkingTimelineProps = {
  events: ActivityEventRow[];
  running: boolean;
};

function stepIcon(kind: string): string {
  if (kind === "thinking") return "\uD83E\uDDE0"; // 🧠
  if (kind === "tool") return "\uD83D\uDD27"; // 🔧
  return "\u25CF"; // ●
}

function stepLabel(event: ActivityEventRow): string {
  if (
    event.label === "thinking" &&
    event.kind === "thinking" &&
    event.status === "done"
  ) {
    return "Thought";
  }
  if (
    event.label === "thinking" &&
    event.kind === "thinking" &&
    event.status === "running"
  ) {
    return "Thinking\u2026";
  }
  // Clean tool labels: "calling read_file" → "read_file", "ran read_file" → "read_file"
  if (event.kind === "tool") {
    return event.label.replace(/^(calling|ran)\s+/, "");
  }
  return event.label;
}

export function ThinkingTimeline({ events, running }: ThinkingTimelineProps) {
  if (events.length === 0) return null;

  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const doneCount = sorted.filter(
    (e) => e.status === "done" || e.status === "error",
  ).length;

  return (
    <div className="rounded-lg border border-muted/60 bg-muted/20 px-3 py-2">
      <div className="mb-2 flex items-center gap-2">
        {running ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Agent working…
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {doneCount} step{doneCount !== 1 ? "s" : ""} completed
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {sorted.map((event) => (
          <TimelineStep key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

function TimelineStep({ event }: { event: ActivityEventRow }) {
  const [open, setOpen] = useState(false);
  const hasDetail = event.detail && event.detail.length > 0;
  const isRunning = event.status === "running";
  const isError = event.status === "error";
  const isDone = event.status === "done";
  const time = relativeTime(event.updated_at || event.created_at);

  return (
    <div className="flex items-start gap-2 py-0.5">
      {/* Status dot */}
      <span
        className={cx(
          "mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full",
          isRunning && "bg-amber-500 animate-pulse",
          isDone && "bg-emerald-500",
          isError && "bg-red-500",
          !isRunning && !isDone && !isError && "bg-muted-foreground/40",
        )}
      />

      {/* Step body */}
      <div className="min-w-0 flex-1">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger
            disabled={!hasDetail}
            className={cx(
              "flex w-full items-center gap-1.5 text-left text-[11px]",
              hasDetail && "cursor-pointer hover:text-foreground",
              !hasDetail && "cursor-default",
            )}
          >
            <span className="shrink-0 text-xs">{stepIcon(event.kind)}</span>
            <span
              className={cx(
                "min-w-0 truncate font-medium",
                isRunning
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-foreground",
              )}
            >
              {stepLabel(event)}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground/50 ml-auto">
              {time}
            </span>
            {hasDetail && (
              <span className="shrink-0 text-[10px] text-muted-foreground/50">
                {open ? "\u25B2" : "\u25BC"}
              </span>
            )}
          </CollapsibleTrigger>
          {hasDetail && (
            <CollapsibleContent>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/40 px-2 py-1.5 text-[10px] text-muted-foreground leading-relaxed">
                {event.detail.length > 800
                  ? event.detail.slice(0, 800) + "\u2026"
                  : event.detail}
              </pre>
            </CollapsibleContent>
          )}
        </Collapsible>
      </div>
    </div>
  );
}
