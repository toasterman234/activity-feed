"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusChip, Badge, type UiTone } from "@/components/ui";
import type { NomadComputeSnapshot, NomadJobSummary, NomadAllocation, NomadEvent } from "@/lib/nomad";
import { NOMAD_DISPATCH_ALLOWLIST } from "@/lib/nomad";

function jobStatusTone(status: string): UiTone {
  switch (status) { case "running": return "good"; case "pending": return "wait"; case "dead": return "neutral"; default: return "neutral"; }
}
function allocTone(status: string): UiTone {
  switch (status) { case "running": return "good"; case "pending": return "wait"; case "failed": case "lost": return "danger"; case "complete": return "neutral"; default: return "neutral"; }
}
function detailChevron(open: boolean) {
  return <span className="shrink-0 text-xs text-muted-foreground">{open ? "▾" : "▸"}</span>;
}

export default function NomadJobsPanel({
  onStatusLine,
}: {
  onStatusLine?: (msg: string) => void;
}) {
  const [nomad, setNomad] = useState<NomadComputeSnapshot | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [dispatchState, setDispatchState] = useState<Record<string, string>>({});
  const [actionState, setActionState] = useState<Record<string, string>>({});
  const [logPanel, setLogPanel] = useState<{ allocId: string; task: string; output: string } | null>(null);
  const [events, setEvents] = useState<NomadEvent[]>([]);

  const allowlisted = useMemo(() => new Set(NOMAD_DISPATCH_ALLOWLIST), []);

  const allocsByJob = useMemo(() => {
    const map = new Map<string, NomadAllocation[]>();
    for (const alloc of nomad?.allocations ?? []) {
      const list = map.get(alloc.jobId) || [];
      list.push(alloc);
      map.set(alloc.jobId, list);
    }
    return map;
  }, [nomad]);

  async function loadNomad() {
    try {
      const res = await fetch("/api/compute", { cache: "no-store" });
      const data = (await res.json()) as NomadComputeSnapshot;
      if (data.ok) setNomad(data);
    } catch { /* Nomad might not be available */ }
  }

  async function doAction(action: string, body: Record<string, unknown>) {
    const key = `${action}:${body.jobName || body.allocId || body.group || ""}`;
    setActionState((p) => ({ ...p, [key]: "running…" }));
    try {
      const res = await fetch("/api/compute/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const d = await res.json();
      setActionState((p) => ({ ...p, [key]: d.ok ? `ok:${d.message}` : `err:${d.message}` }));
      onStatusLine?.(d.message);
      setTimeout(() => loadNomad(), 2000);
      if (action === "logs" && d.ok) {
        setLogPanel({ allocId: body.allocId as string, task: body.task as string, output: d.logs || "(empty)" });
      }
    } catch (e) {
      setActionState((p) => ({ ...p, [key]: `err:${e instanceof Error ? e.message : String(e)}` }));
    }
  }

  async function doDispatch(jobName: string) {
    setDispatchState((p) => ({ ...p, [jobName]: "dispatching…" }));
    onStatusLine?.(`Dispatching ${jobName}…`);
    try {
      const res = await fetch("/api/compute/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobName }),
      });
      const d = await res.json();
      setDispatchState((p) => ({ ...p, [jobName]: d.ok ? `ok:${d.message}` : `err:${d.message}` }));
      onStatusLine?.(d.message);
      setTimeout(() => loadNomad(), 2000);
    } catch (e) {
      setDispatchState((p) => ({ ...p, [jobName]: `err:${e instanceof Error ? e.message : String(e)}` }));
    }
  }

  // SSE event stream
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/compute/events");
      eventSource.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as NomadEvent;
          setEvents((prev) => [ev, ...prev].slice(0, 30));
        } catch {}
      };
      eventSource.onerror = () => { eventSource?.close(); };
    } catch {}
    return () => { eventSource?.close(); };
  }, []);

  // Poll for full snapshot
  useEffect(() => {
    loadNomad();
    const timer = setInterval(loadNomad, 15000);
    return () => clearInterval(timer);
  }, []);

  if (!nomad || nomad.jobs.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-xs font-semibold text-foreground">Nomad Jobs</h2>
        <span className="text-[10px] text-muted-foreground">
          {nomad.jobs.length} job{nomad.jobs.length !== 1 ? "s" : ""} · {nomad.allocations?.length ?? 0} allocs
        </span>
        {events.length > 0 && (
          <span className="text-[9px] text-muted-foreground">
            · {events.length} events
          </span>
        )}
      </div>

      {/* Live event ticker */}
      {events.length > 0 && (
        <div className="overflow-hidden rounded-md bg-muted/20 px-2 py-1">
          <div className="flex gap-3 overflow-x-auto text-[9px] font-mono text-muted-foreground whitespace-nowrap">
            {events.slice(0, 8).map((ev, i) => (
              <span key={i} className="shrink-0">
                <span className="text-foreground">{ev.topic}</span>
                {ev.message}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Logs panel */}
      {logPanel && (
        <div className="rounded-lg border border-border bg-card/50 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-foreground">
              Logs: {logPanel.allocId.slice(0, 8)} / {logPanel.task}
            </span>
            <button onClick={() => setLogPanel(null)} className="text-[9px] text-muted-foreground hover:text-foreground">close</button>
          </div>
          <pre className="text-[10px] font-mono text-foreground bg-muted/30 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
            {logPanel.output}
          </pre>
        </div>
      )}

      {/* Job rows */}
      {nomad.jobs.map((job) => {
        const open = expandedJob === job.id;
        const jobAllocs = allocsByJob.get(job.id) ?? [];
        const totalRunning = Object.values(job.summary).reduce((s, tg) => s + tg.running, 0);
        const totalFailed = Object.values(job.summary).reduce((s, tg) => s + tg.failed + tg.lost, 0);
        const stopKey = `stop:${job.name}`;
        return (
          <div key={job.id} className="rounded-lg border border-border bg-card/50 px-3 py-2 space-y-1">
            <div className="flex w-full items-center justify-between gap-2">
              <button onClick={() => setExpandedJob(open ? null : job.id)} className="flex flex-1 items-center gap-2 text-left min-w-0">
                <span className="text-[11px] font-semibold text-foreground truncate">{job.name}</span>
                <StatusChip tone={jobStatusTone(job.status)}>{job.status}</StatusChip>
                <span className="text-[9px] text-muted-foreground">{job.type} · pool {job.nodePool}</span>
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-mono text-foreground">{totalRunning}r</span>
                {totalFailed > 0 && <span className="text-[10px] font-mono text-red-600 dark:text-red-400">{totalFailed}f</span>}
                {allowlisted.has(job.name) && job.parameterized && (
                  <button onClick={() => doDispatch(job.name)} disabled={dispatchState[job.name] === "dispatching…"}
                    className="rounded-md bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {dispatchState[job.name] === "dispatching…" ? "⋯" : dispatchState[job.name]?.startsWith("ok:") ? "✓" : dispatchState[job.name]?.startsWith("err:") ? "✕" : "Launch"}
                  </button>
                )}
                <button onClick={() => doAction("stop", { jobName: job.name })}
                  disabled={actionState[stopKey] === "running…"}
                  className="rounded border border-red-300 dark:border-red-800 px-1.5 py-0.5 text-[9px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50">
                  {actionState[stopKey] === "running…" ? "⋯" : "Stop"}
                </button>
                <button onClick={() => setExpandedJob(open ? null : job.id)}>
                  {detailChevron(open)}
                </button>
              </div>
            </div>

            {open && (
              <div className="space-y-1.5 pt-1 border-t border-border/50">
                {/* Task group summary with scale controls */}
                {Object.entries(job.summary).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 text-[9px]">
                    {Object.entries(job.summary).map(([group, s]) => {
                      const current = s.running + s.queued + s.starting;
                      return (
                        <span key={group} className="rounded bg-muted/50 px-1.5 py-0.5 flex items-center gap-1">
                          <span className="font-medium text-foreground">{group}</span>
                          <span className="text-muted-foreground">{s.running}r {s.queued>0&&`${s.queued}q `}{s.failed>0&&`${s.failed}f `}{s.complete>0&&`${s.complete}c`}</span>
                          <button onClick={() => doAction("scale", { jobName: job.name, group, count: Math.max(0, current - 1) })}
                            className="text-muted-foreground hover:text-foreground font-mono px-0.5">−</button>
                          <button onClick={() => doAction("scale", { jobName: job.name, group, count: current + 1 })}
                            className="text-muted-foreground hover:text-foreground font-mono px-0.5">+</button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Allocations with restart + logs */}
                {jobAllocs.length > 0 && (
                  <div className="space-y-0.5">
                    {jobAllocs.map((alloc) => (
                      <div key={alloc.id} className="flex items-center justify-between rounded bg-muted/20 px-2 py-1 text-[10px]">
                        <button onClick={() => doAction("logs", { allocId: alloc.id, task: alloc.taskGroup === "hello" ? "server" : alloc.taskGroup })}
                          className="flex items-center gap-1.5 min-w-0 hover:text-primary">
                          <span className="font-mono text-foreground">{alloc.id.slice(0, 8)}</span>
                          <span className="text-muted-foreground">on {alloc.nodeName}</span>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <StatusChip tone={allocTone(alloc.status)}>{alloc.status}</StatusChip>
                          <button onClick={() => doAction("restart", { allocId: alloc.id })}
                            className="text-[9px] text-sky-600 dark:text-sky-400 hover:underline ml-1">↻</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
