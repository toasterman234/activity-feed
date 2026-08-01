"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Zap } from "lucide-react";
import { cx } from "@/components/ui";
import type { ActivityEventRow } from "./shapes";
import { buildAgentTraceSteps, summarizeAgentTrace } from "./agentTraceModel";
import { AgentTraceStep } from "./AgentTraceStep";

export function AgentTraceCard({
  events,
  running,
  title,
}: {
  events: ActivityEventRow[];
  running: boolean;
  title?: string;
}) {
  const steps = useMemo(() => buildAgentTraceSteps(events), [events]);
  const [expanded, setExpanded] = useState(running);
  const [selectedId, setSelectedId] = useState<string | null>(steps[steps.length - 1]?.id ?? null);

  useEffect(() => {
    if (running) setExpanded(true);
  }, [running]);

  useEffect(() => {
    if (!steps.some((step) => step.id === selectedId)) {
      setSelectedId(steps[steps.length - 1]?.id ?? null);
    }
  }, [steps, selectedId]);

  if (steps.length === 0) return null;

  const selected = steps.find((step) => step.id === selectedId) ?? steps[steps.length - 1];
  const summary = summarizeAgentTrace(steps, running);

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-[linear-gradient(180deg,rgba(8,145,178,0.10),rgba(8,145,178,0.04))] shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cx(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
              running
                ? "border-amber-400/60 bg-amber-500/10 text-amber-300"
                : "border-cyan-400/40 bg-cyan-500/10 text-cyan-300",
            )}
          >
            <Zap className={cx("h-4 w-4", running && "animate-pulse")} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {title || (running ? "Agent working" : "Agent trace")}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{summary}</span>
              {selected?.detail && !expanded && (
                <>
                  <span>•</span>
                  <span className="truncate">{selected.detail.slice(0, 72)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <span className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-cyan-500/15 px-4 pb-4 pt-3">
          <div className="space-y-2">
            {steps.map((step, index) => (
              <AgentTraceStep
                key={step.id}
                step={step}
                active={index < steps.length - 1}
                selected={selected?.id === step.id}
                onSelect={() => setSelectedId(step.id)}
              />
            ))}
          </div>

          {selected?.detail && (
            <div className="mt-3 rounded-xl border border-cyan-500/15 bg-background/70 p-3">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-cyan-300/80">
                {selected.title}
              </div>
              <div className="max-h-56 overflow-auto whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {selected.detail.length > 1400 ? `${selected.detail.slice(0, 1400)}…` : selected.detail}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
