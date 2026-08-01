"use client";

import { Brain, CheckCircle2, CircleDot, AlertCircle, Wrench, Sparkles } from "lucide-react";
import { relativeTime } from "./shapes";
import type { AgentTraceStep as AgentTraceStepModel } from "./agentTraceModel";
import { cx } from "@/components/ui";

export function AgentTraceStep({
  step,
  active,
  selected,
  onSelect,
}: {
  step: AgentTraceStepModel;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const StatusIcon =
    step.status === "error"
      ? AlertCircle
      : step.status === "done"
        ? CheckCircle2
        : step.status === "running"
          ? CircleDot
          : Sparkles;

  const KindIcon =
    step.kind === "tool" ? Wrench : step.kind === "status" ? Sparkles : Brain;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        "group relative flex min-w-0 flex-1 items-start gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
        selected
          ? "border-cyan-400/60 bg-cyan-500/10"
          : "border-border/60 bg-background/60 hover:border-cyan-400/40 hover:bg-cyan-500/5",
      )}
    >
      <div className="flex flex-col items-center pt-0.5">
        <span
          className={cx(
            "flex h-8 w-8 items-center justify-center rounded-full border",
            step.status === "running" && "border-amber-400/60 bg-amber-500/10 text-amber-300",
            step.status === "done" && "border-emerald-400/60 bg-emerald-500/10 text-emerald-300",
            step.status === "error" && "border-red-400/60 bg-red-500/10 text-red-300",
            step.status === "idle" && "border-border/70 bg-muted/50 text-muted-foreground",
          )}
        >
          <KindIcon className="h-4 w-4" />
        </span>
        {active && <span className="mt-2 h-8 w-px bg-gradient-to-b from-cyan-400/70 to-transparent" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{step.title}</span>
          <StatusIcon
            className={cx(
              "h-3.5 w-3.5 shrink-0",
              step.status === "running" && "text-amber-400 animate-pulse",
              step.status === "done" && "text-emerald-400",
              step.status === "error" && "text-red-400",
              step.status === "idle" && "text-muted-foreground",
            )}
          />
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{step.kind}</span>
          <span>•</span>
          <span>{relativeTime(step.updatedAt)}</span>
          {step.eventCount > 1 && (
            <>
              <span>•</span>
              <span>{step.eventCount} events</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
