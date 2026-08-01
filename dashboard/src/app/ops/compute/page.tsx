"use client";

import { useEffect, useMemo, useState } from "react";
import {
  StatusChip,
  Badge,
  type UiTone,
} from "@/components/ui";
import type {
  NomadComputeSnapshot,
  NomadNode,
  NomadJobSummary,
  NomadAllocation,
} from "@/lib/nomad";

// ── Helpers ─────────────────────────────────────────────────────────────

function nodeTone(node: NomadNode): UiTone {
  if (node.status !== "ready") return "danger";
  if (node.drain) return "wait";
  if (node.schedulingEligibility === "ineligible") return "wait";
  return "good";
}

function jobStatusTone(status: string): UiTone {
  switch (status) {
    case "running":
      return "good";
    case "pending":
      return "wait";
    case "dead":
      return "neutral";
    default:
      return "neutral";
  }
}

function allocTone(status: string): UiTone {
  switch (status) {
    case "running":
      return "good";
    case "pending":
      return "wait";
    case "failed":
    case "lost":
      return "danger";
    case "complete":
      return "neutral";
    default:
      return "neutral";
  }
}

function MetricBar({
  label,
  value,
  max = 100,
  suffix = "%",
}: {
  label: string;
  value: number;
  max?: number;
  suffix?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const color =
    pct >= 80
      ? "bg-red-500"
      : pct >= 60
        ? "bg-amber-500"
        : pct >= 35
          ? "bg-sky-500"
          : "bg-emerald-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground text-[11px]">
          {value.toFixed(value < 10 ? 1 : 0)}
          {suffix}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function detailChevron(open: boolean) {
  return (
    <span className="shrink-0 text-xs text-muted-foreground">
      {open ? "▾" : "▸"}
    </span>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default function ComputePage() {
  const [snapshot, setSnapshot] = useState<NomadComputeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"nodes" | "jobs">("nodes");

  async function load() {
    try {
      const res = await fetch("/api/compute", { cache: "no-store" });
      const data = (await res.json()) as NomadComputeSnapshot;
      if (!data.ok) throw new Error(data.error || "snapshot failed");
      setSnapshot(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  // Group allocations by jobId for expand
  const allocsByJob = useMemo(() => {
    const map = new Map<string, NomadAllocation[]>();
    for (const alloc of snapshot?.allocations ?? []) {
      const list = map.get(alloc.jobId) || [];
      list.push(alloc);
      map.set(alloc.jobId, list);
    }
    return map;
  }, [snapshot]);

  const updatedText = snapshot
    ? `updated ${new Date(snapshot.generatedAt).toLocaleTimeString()}`
    : "connecting…";

  const nodeCount = snapshot?.nodes.length ?? 0;
  const jobCount = snapshot?.jobs.length ?? 0;
  const readyNodes = snapshot?.nodes.filter((n) => n.status === "ready").length ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-3 px-3 py-3">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-foreground">Compute</h1>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {updatedText} · {readyNodes}/{nodeCount} nodes ready · {jobCount} jobs
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
          <button
            onClick={() => setActiveTab("nodes")}
            className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              activeTab === "nodes"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Nodes
          </button>
          <button
            onClick={() => setActiveTab("jobs")}
            className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              activeTab === "jobs"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Jobs
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Compute API: {error}
        </div>
      )}

      {/* ── Nodes tab ──────────────────────────────────────────────────── */}
      {activeTab === "nodes" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(snapshot?.nodes ?? []).map((node) => {
            const cpuPct =
              node.resources.cpu.total > 0
                ? (node.resources.cpu.allocated / node.resources.cpu.total) * 100
                : 0;
            const memPct =
              node.resources.memory.totalMB > 0
                ? (node.resources.memory.allocatedMB /
                    node.resources.memory.totalMB) *
                  100
                : 0;

            return (
              <div
                key={node.id}
                className="rounded-xl border border-border bg-card p-3 space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">
                      {node.name}
                    </h2>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {node.nodePool} · {node.datacenter}
                      {node.nodeClass ? ` · ${node.nodeClass}` : ""}
                    </p>
                  </div>
                  <StatusChip tone={nodeTone(node)}>
                    {node.drain ? "draining" : node.status}
                  </StatusChip>
                </div>

                {/* Resources */}
                <MetricBar
                  label="CPU"
                  value={cpuPct}
                  max={100}
                  suffix="%"
                />
                <div className="text-[9px] text-muted-foreground -mt-2 mb-1 font-mono">
                  {node.resources.cpu.allocated.toFixed(1)} / {node.resources.cpu.total.toFixed(1)} cores
                </div>

                <MetricBar
                  label="Memory"
                  value={memPct}
                  max={100}
                  suffix="%"
                />
                <div className="text-[9px] text-muted-foreground -mt-2 mb-1 font-mono">
                  {node.resources.memory.allocatedMB} / {node.resources.memory.totalMB} MB
                </div>

                {/* Eligibility / drain */}
                {node.schedulingEligibility === "ineligible" && (
                  <Badge variant="secondary" className="text-[10px]">
                    scheduling disabled
                  </Badge>
                )}
              </div>
            );
          })}
          {snapshot?.nodes.length === 0 && !error && (
            <p className="text-[11px] text-muted-foreground col-span-2 text-center py-8">
              No nodes found.
            </p>
          )}
        </div>
      )}

      {/* ── Jobs tab ───────────────────────────────────────────────────── */}
      {activeTab === "jobs" && (
        <div className="space-y-2">
          {(snapshot?.jobs ?? []).map((job) => {
            const open = expandedJob === job.id;
            const jobAllocs = allocsByJob.get(job.id) ?? [];
            const summary = job.summary;
            const totalRunning = Object.values(summary).reduce(
              (s, tg) => s + tg.running,
              0
            );
            const totalFailed = Object.values(summary).reduce(
              (s, tg) => s + tg.failed + tg.lost,
              0
            );

            return (
              <div
                key={job.id}
                className="rounded-xl border border-border bg-card p-3 space-y-2"
              >
                {/* Job row header */}
                <button
                  onClick={() => setExpandedJob(open ? null : job.id)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {job.name}
                      </span>
                      <StatusChip tone={jobStatusTone(job.status)}>
                        {job.status}
                      </StatusChip>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {job.type} · {job.taskGroups} group
                      {job.taskGroups !== 1 ? "s" : ""} · pool {job.nodePool}
                      {job.periodic ? " · periodic" : ""}
                      {job.parameterized ? " · parameterized" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[11px] font-mono text-foreground">
                        {totalRunning}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {" "}
                        running
                      </span>
                      {totalFailed > 0 && (
                        <span className="text-[11px] font-mono text-red-600 dark:text-red-400 ml-1">
                          {totalFailed}
                        </span>
                      )}
                    </div>
                    {detailChevron(open)}
                  </div>
                </button>

                {/* Expanded: task groups + allocations */}
                {open && (
                  <div className="space-y-2 pt-1 border-t border-border">
                    {/* Task group summary */}
                    {Object.entries(summary).length > 0 && (
                      <div className="flex flex-wrap gap-2 text-[10px]">
                        {Object.entries(summary).map(([group, s]) => (
                          <div
                            key={group}
                            className="rounded-md bg-muted/30 px-2 py-1"
                          >
                            <span className="font-medium text-foreground">
                              {group}
                            </span>
                            <span className="text-muted-foreground ml-1.5">
                              {s.running > 0 && (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {s.running}r{" "}
                                </span>
                              )}
                              {s.queued > 0 && (
                                <span className="text-amber-500">
                                  {s.queued}q{" "}
                                </span>
                              )}
                              {s.starting > 0 && (
                                <span className="text-sky-500">
                                  {s.starting}s{" "}
                                </span>
                              )}
                              {s.failed > 0 && (
                                <span className="text-red-500">
                                  {s.failed}f{" "}
                                </span>
                              )}
                              {s.complete > 0 && (
                                <span className="text-muted-foreground">
                                  {s.complete}c{" "}
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Allocations */}
                    {jobAllocs.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Allocations
                        </p>
                        {jobAllocs.map((alloc) => (
                          <div
                            key={alloc.id}
                            className="flex items-center justify-between rounded-md bg-muted/20 px-2 py-1.5 text-[10px]"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-foreground truncate">
                                {alloc.id.slice(0, 8)}
                              </span>
                              <Badge
                                variant="secondary"
                                className="text-[9px]"
                              >
                                {alloc.taskGroup}
                              </Badge>
                              <span className="text-muted-foreground">
                                on {alloc.nodeName}
                              </span>
                            </div>
                            <StatusChip tone={allocTone(alloc.status)}>
                              {alloc.status}
                            </StatusChip>
                          </div>
                        ))}
                      </div>
                    )}
                    {jobAllocs.length === 0 && (
                      <p className="text-[10px] text-muted-foreground py-2">
                        No allocations
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {snapshot?.jobs.length === 0 && !error && (
            <p className="text-[11px] text-muted-foreground text-center py-8">
              No jobs running.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
