"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FLEET_HOSTS, type BuzzAgentsSnapshot, type FleetActionId, type FleetHost, type FleetSnapshot } from "@/lib/fleet";
import { Badge, StatusChip, type UiTone } from "@/components/ui";
import type { NomadComputeSnapshot, NomadJobSummary, NomadAllocation } from "@/lib/nomad";
import { NOMAD_DISPATCH_ALLOWLIST } from "@/lib/nomad";

type AgentHealthEntry = {
  id: string;
  name: string;
  host: "ovh" | "mac";
  runtime: string;
  status: "running" | "stopped" | "offline" | "error";
  detail: string;
  metricLabel: string;
  metricValue: string;
  alert: boolean;
};

type AgentHealthSnapshot = {
  agents: AgentHealthEntry[];
  alerts: string[];
  generated_at: string;
};

function toneStyles(tone: FleetHost["health"]): string {
  switch (tone) {
    case "healthy": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    case "warn": return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    case "cool": return "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
    default: return "bg-muted text-muted-foreground";
  }
}

function toneChip(tone: FleetHost["health"]): UiTone {
  if (tone === "healthy") return "good";
  if (tone === "warn") return "wait";
  if (tone === "cool") return "active";
  return "neutral";
}

function MetricBar({ label, value, suffix = "%" }: { label: string; value: number; suffix?: string }) {
  const color = value >= 80 ? "bg-red-500" : value >= 60 ? "bg-amber-500" : value >= 35 ? "bg-sky-500" : "bg-emerald-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground text-[11px]">{value.toFixed(value < 10 ? 2 : 0)}{suffix}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function detailChevron(open: boolean) {
  return <span className="shrink-0 text-xs text-muted-foreground">{open ? "▾" : "▸"}</span>;
}

function BuzzAgentsPanel() {
  const [buzzAgents, setBuzzAgents] = useState<BuzzAgentsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents/buzz-agents", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setBuzzAgents(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    const timer = setInterval(() => {
      fetch("/api/agents/buzz-agents", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (!cancelled) { setBuzzAgents(d); setError(null); } })
        .catch(() => {});
    }, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (error) return null;

  const activeAgents = buzzAgents?.agents?.filter(a => a.is_active && a.pubkey) ?? [];
  if (!activeAgents.length) return null;

  return (
    <div className="rounded-md bg-muted/30 px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground">
          Buzz Agents ({buzzAgents?.running ?? 0}/{buzzAgents?.total ?? 0})
        </span>
      </div>
      <div className="space-y-1">
        {activeAgents.map((a) => (
          <div key={a.pubkey || a.name} className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${a.running ? "bg-emerald-500" : "bg-zinc-400"}`} />
              <span className="font-medium text-foreground truncate">{a.name}</span>
              <span className="text-muted-foreground truncate">{a.runtime}</span>
            </div>
            <span className="shrink-0 text-muted-foreground ml-2 font-mono">
              {a.running ? `PID ${a.pid}` : a.last_stopped_at ? "stopped" : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentHealthPanel() {
  const [health, setHealth] = useState<AgentHealthSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchHealth = () => {
      fetch("/api/agents/health", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setHealth(d); })
        .catch(() => {});
    };
    fetchHealth();
    const timer = setInterval(fetchHealth, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (!health || !health.agents.length) return null;

  const runningCount = health.agents.filter(a => a.status === "running").length;
  const alertCount = health.alerts.length;

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-foreground">Agent Health</h2>
          <span className="text-[10px] text-muted-foreground">
            {runningCount}/{health.agents.length} running
          </span>
        </div>
        {alertCount > 0 && (
          <span className="rounded-full bg-red-100 dark:bg-red-950 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
            {alertCount} alert{alertCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Alerts */}
      {health.alerts.length > 0 && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-2.5 py-1.5 space-y-0.5">
          {health.alerts.map((alert, i) => (
            <p key={i} className="text-[10px] text-red-700 dark:text-red-300 font-medium">{alert}</p>
          ))}
        </div>
      )}

      {/* Agent rows */}
      <div className="space-y-0.5">
        {health.agents.map((a) => (
          <div
            key={a.id}
            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[10px] ${
              a.alert ? "bg-red-50/50 dark:bg-red-950/30" : "bg-muted/20"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                  a.status === "running" ? "bg-emerald-500" :
                  a.status === "stopped" ? "bg-zinc-400" :
                  a.status === "error" ? "bg-red-500" : "bg-amber-500"
                }`}
              />
              <span className="font-medium text-foreground truncate">{a.name}</span>
              <span className="text-muted-foreground">{a.runtime}</span>
              <Badge variant="secondary" className="text-[9px]">{a.host}</Badge>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-2">
              <span className="text-muted-foreground">{a.detail}</span>
              <span className={`font-mono ${a.alert ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}`}>
                {a.metricLabel}: {a.metricValue}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function jobStatusTone(status: string): UiTone {
  switch (status) {
    case "running": return "good";
    case "pending": return "wait";
    case "dead": return "neutral";
    default: return "neutral";
  }
}

function allocTone(status: string): UiTone {
  switch (status) {
    case "running": return "good";
    case "pending": return "wait";
    case "failed": case "lost": return "danger";
    case "complete": return "neutral";
    default: return "neutral";
  }
}

function NomadJobsPanel({
  nomad,
  expandedJob,
  setExpandedJob,
  dispatchState,
  onDispatch,
}: {
  nomad: NomadComputeSnapshot;
  expandedJob: string | null;
  setExpandedJob: (id: string | null) => void;
  dispatchState: Record<string, string>;
  onDispatch: (jobName: string) => void;
}) {
  const allowlisted = new Set(NOMAD_DISPATCH_ALLOWLIST);
  const allocsByJob = useMemo(() => {
    const map = new Map<string, NomadAllocation[]>();
    for (const alloc of nomad.allocations ?? []) {
      const list = map.get(alloc.jobId) || [];
      list.push(alloc);
      map.set(alloc.jobId, list);
    }
    return map;
  }, [nomad]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-xs font-semibold text-foreground">Nomad Jobs</h2>
        <span className="text-[10px] text-muted-foreground">
          {nomad.jobs.length} job{nomad.jobs.length !== 1 ? "s" : ""} · {nomad.allocations?.length ?? 0} allocs
        </span>
      </div>
      {nomad.jobs.map((job) => {
        const open = expandedJob === job.id;
        const jobAllocs = allocsByJob.get(job.id) ?? [];
        const totalRunning = Object.values(job.summary).reduce((s, tg) => s + tg.running, 0);
        const totalFailed = Object.values(job.summary).reduce((s, tg) => s + tg.failed + tg.lost, 0);
        return (
          <div key={job.id} className="rounded-lg border border-border bg-card/50 px-3 py-2 space-y-1">
            <button
              onClick={() => setExpandedJob(open ? null : job.id)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-[11px] font-semibold text-foreground truncate">{job.name}</span>
                <StatusChip tone={jobStatusTone(job.status)}>{job.status}</StatusChip>
                <span className="text-[9px] text-muted-foreground">{job.type} · pool {job.nodePool}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono text-foreground">{totalRunning}r</span>
                {totalFailed > 0 && (
                  <span className="text-[10px] font-mono text-red-600 dark:text-red-400">{totalFailed}f</span>
                )}
                {allowlisted.has(job.name) && job.parameterized && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDispatch(job.name); }}
                    disabled={dispatchState[job.name] === "dispatching…"}
                    className="rounded-md bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {dispatchState[job.name] === "dispatching…"
                      ? "⋯"
                      : dispatchState[job.name]?.startsWith("ok:")
                        ? "✓"
                        : dispatchState[job.name]?.startsWith("err:")
                          ? "✕"
                          : "Launch"}
                  </button>
                )}
                {detailChevron(open)}
              </div>
            </button>
            {open && (
              <div className="space-y-1.5 pt-1 border-t border-border/50">
                {Object.entries(job.summary).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 text-[9px]">
                    {Object.entries(job.summary).map(([group, s]) => (
                      <span key={group} className="rounded bg-muted/50 px-1.5 py-0.5">
                        <span className="font-medium text-foreground">{group}</span>
                        <span className="text-muted-foreground ml-1">{s.running}r {s.queued>0&&`${s.queued}q `}{s.failed>0&&`${s.failed}f `}{s.complete>0&&`${s.complete}c`}</span>
                      </span>
                    ))}
                  </div>
                )}
                {jobAllocs.length > 0 && (
                  <div className="space-y-0.5">
                    {jobAllocs.map((alloc) => (
                      <div key={alloc.id} className="flex items-center justify-between rounded bg-muted/20 px-2 py-1 text-[10px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-foreground">{alloc.id.slice(0, 8)}</span>
                          <span className="text-muted-foreground">on {alloc.nodeName}</span>
                        </div>
                        <StatusChip tone={allocTone(alloc.status)}>{alloc.status}</StatusChip>
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

export default function FleetPage() {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState("Live fleet …");
  const [expandedProcs, setExpandedProcs] = useState<string | null>(null);
  const [expandedCtns, setExpandedCtns] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  // Track per-container in-flight ops: "stop"|"restart"|"remove" means in progress; "ok-<action>"|"err-<msg>" on completion
  const [ctnState, setCtnState] = useState<Record<string, string>>({});
  const [poolCmd, setPoolCmd] = useState("");
  const [poolResult, setPoolResult] = useState<{ ok: boolean; message: string; dag?: string; runId?: string; command?: string } | null>(null);
  const [poolOutput, setPoolOutput] = useState<string | null>(null);
  const [poolStatus, setPoolStatus] = useState<string>("");
  const [macHealth, setMacHealth] = useState<string>("…");
  const [nomad, setNomad] = useState<NomadComputeSnapshot | null>(null);
  const [expandedNomadJob, setExpandedNomadJob] = useState<string | null>(null);
  const [dispatchState, setDispatchState] = useState<Record<string, string>>({});

  const mergedHosts = useMemo(() => {
    const liveById = new Map((snapshot?.hosts || []).map((h) => [h.id, h]));
    return FLEET_HOSTS.map((host) => {
      const live = liveById.get(host.id);
      return live ? { ...host, ...live } : host;
    });
  }, [snapshot]);

  async function runCtnAction(hostId: string, ctnName: string, action: FleetActionId, label: string) {
    setCtnState((prev) => ({ ...prev, [ctnName]: action }));
    try {
      const res = await fetch("/api/fleet/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostId, action, name: ctnName }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setCtnState((prev) => ({ ...prev, [ctnName]: `ok-${action}` }));
      // Optimistic: remove from snapshot immediately so it disappears
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          hosts: prev.hosts.map((h) =>
            h.id === hostId
              ? { ...h, containers: (h.containers || []).filter((c) => c.name !== ctnName) }
              : h,
          ),
        };
      });
    } catch (e) {
      setCtnState((prev) => ({ ...prev, [ctnName]: `err-${e instanceof Error ? e.message : String(e)}` }));
    }
  }

  async function loadSnapshot() {
    try {
      const [snapRes, healthRes] = await Promise.all([
        fetch("/api/fleet", { cache: "no-store" }),
        fetch("/api/fleet/health", { cache: "no-store" }).catch(() => null),
      ]);
      const data = (await snapRes.json()) as FleetSnapshot;
      if (!snapRes.ok || !data.ok) throw new Error(data?.error || `HTTP ${snapRes.status}`);
      setSnapshot(data);
      setSnapshotError(null);
      setStatusLine(`Updated ${new Date(data.generatedAt).toLocaleTimeString()}`);
      // Mac health
      if (healthRes) {
        const hd = await healthRes.json() as { status?: string };
        setMacHealth(hd.status || "unknown");
      }
    } catch (e) {
      setSnapshotError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runAction(hostId: string, action: FleetActionId, label: string) {
    setStatusLine(`${label}…`);
    try {
      const res = await fetch("/api/fleet/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostId, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (data.kind === "url" && data.value) {
        window.open(data.value, "_blank", "noopener,noreferrer");
        setStatusLine(data.message || `Opened ${label}`);
      } else if (data.kind === "command" && data.value) {
        await navigator.clipboard?.writeText(data.value).catch(() => {});
        setStatusLine(`Copied: ${data.value}`);
      } else if (data.kind === "snapshot") {
        setSnapshot(data.snapshot as FleetSnapshot);
        setStatusLine(data.message || `Refreshed ${hostId}`);
      } else {
        setStatusLine(data.message || `${label} done`);
      }
    } catch (e) {
      setStatusLine(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function loadNomad() {
    try {
      const res = await fetch("/api/compute", { cache: "no-store" });
      const data = (await res.json()) as NomadComputeSnapshot;
      if (data.ok) setNomad(data);
    } catch { /* Nomad might not be available */ }
  }

  useEffect(() => {
    void loadSnapshot();
    void loadNomad();
    const timer = window.setInterval(loadSnapshot, 15000);
    const nomadTimer = window.setInterval(loadNomad, 15000);
    return () => { window.clearInterval(timer); window.clearInterval(nomadTimer); };
  }, []);

  const updatedText = snapshot
    ? `updated ${new Date(snapshot.generatedAt).toLocaleTimeString()}`
    : "connecting…";

  return (
    <div className="mx-auto max-w-5xl space-y-3 px-3 py-3">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-foreground">Fleet</h1>
          <p className="text-[10px] text-muted-foreground mt-0.5">{updatedText}</p>
        </div>
        <Link href="/ops/config?tab=models" className="text-[10px] text-primary hover:underline">
          Models
        </Link>
      </div>

      {/* Agent Health */}
      <AgentHealthPanel />

      {/* Pool Run */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-foreground">Run Command</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${macHealth === "healthy" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : macHealth === "overloaded" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-muted text-muted-foreground"}`}>
            Mac {macHealth}
          </span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!poolCmd.trim()) return;
            const cmd = poolCmd.trim();
            setPoolResult(null);
            setPoolOutput(null);
            setPoolStatus("submitting…");
            setStatusLine("Submitting…");
            fetch("/api/fleet/action", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ hostId: "ovh", action: "pool-command", command: cmd }),
            })
              .then((r) => r.json())
              .then((d) => {
                if (!d.ok) throw new Error(d.error || "failed");
                setPoolResult(d);
                setStatusLine(d.message);
                setPoolStatus("running…");
                // Poll for output
                if (d.dag && d.runId) {
                  const poll = setInterval(() => {
                    fetch(`/api/fleet/run-output?dag=${d.dag}&runId=${d.runId}`, { cache: "no-store" })
                      .then((r) => r.json())
                      .then((out) => {
                        if (!out.ok) return;
                        if (out.stdout) setPoolOutput(out.stdout);
                        if (out.status === "succeeded" || out.status === "failed") {
                          setPoolStatus(out.status);
                          setPoolOutput((prev) => prev || out.stdout);
                          clearInterval(poll);
                        }
                      })
                      .catch(() => { /* keep polling */ });
                  }, 3000);
                  // Stop polling after 60s
                  setTimeout(() => clearInterval(poll), 60000);
                }
              })
              .catch((e) => {
                setPoolResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
                setPoolStatus("error");
                setStatusLine(`pool-run error: ${e instanceof Error ? e.message : String(e)}`);
              });
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={poolCmd}
            onChange={(e) => setPoolCmd(e.target.value)}
            placeholder="python script.py | hostname | echo hello"
            className="flex-1 rounded-md border border-border bg-muted px-2 py-1.5 text-[11px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={!poolCmd.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Run
          </button>
        </form>
        {poolResult && (
          <div className="space-y-1">
            <p className={`text-[10px] ${poolResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {poolStatus === "running…" ? "⋯" : poolResult.ok ? "✓" : "✕"} {poolResult.message}
              {poolStatus === "running…" ? " polling…" : poolStatus === "succeeded" ? " done" : poolStatus === "failed" ? " failed" : ""}
            </p>
            {poolOutput && (
              <pre className="text-[10px] font-mono bg-muted/50 rounded-md px-2 py-1.5 overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto text-foreground">{poolOutput}</pre>
            )}
          </div>
        )}
      </div>

      {snapshotError && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Fleet API: {snapshotError}
        </div>
      )}

      {/* Host cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {mergedHosts.map((host) => {
          const procs = (host.processes || []).slice(0, 5);
          const ctns = (host.containers || []).slice(0, 5);
          const procsOpen = expandedProcs === host.id;
          const ctnsOpen = expandedCtns === host.id;

          return (
            <div key={host.id} className="rounded-xl border border-border bg-card p-3 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">{host.name}</h2>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{host.role} · {host.hostname}</p>
                </div>
                <StatusChip tone={toneChip(host.health)}>{host.health}</StatusChip>
              </div>

              {/* Metrics */}
              <MetricBar label="CPU" value={host.cpu} />
              <MetricBar label="Mem" value={host.memory} />
              <MetricBar label="Disk" value={host.storage} />

              {/* Services */}
              {host.services.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {host.services.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                  ))}
                </div>
              )}

              {/* Dagu */}
              {host.dagu?.ok && host.dagu?.url && (
                <a
                  href={host.dagu.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 hover:underline"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  Dagu{host.dagu.dags ? ` · ${host.dagu.dags} DAGs` : ""}
                </a>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-1.5">
                {host.controls.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => void runAction(host.id, c.action, c.label)}
                    className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted/50 transition-colors"
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* iii Engine Health (OVH only) */}
              {host.id === "ovh" && host.iiiHealth && (
                <div className="rounded-md bg-muted/30 px-2.5 py-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground">iii Engine</span>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${host.iiiHealth.active ? "bg-emerald-500" : "bg-red-500"}`} />
                  </div>
                  {host.iiiHealth.active ? (
                    <>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                        <span className="text-muted-foreground">Memory</span>
                        <span
                          className={`font-mono text-right ${
                            host.iiiHealth.memory_pressure_pct >= 80
                              ? "text-red-600 dark:text-red-400"
                              : host.iiiHealth.memory_pressure_pct >= 60
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-foreground"
                          }`}
                        >
                          {(host.iiiHealth.memory_current_bytes / 1_073_741_824).toFixed(1)}G / {(host.iiiHealth.memory_high_bytes / 1_073_741_824).toFixed(0)}G
                        </span>
                        <span className="text-muted-foreground">Sessions</span>
                        <span className="font-mono text-right text-foreground">
                          {host.iiiHealth.active_sessions > 0
                            ? `${host.iiiHealth.active_sessions} active`
                            : `${host.iiiHealth.total_sessions} total`}
                          {host.iiiHealth.quarantined_sessions > 0 && (
                            <span className="text-amber-500"> · {host.iiiHealth.quarantined_sessions} quar</span>
                          )}
                        </span>
                        <span className="text-muted-foreground">Tasks</span>
                        <span className="font-mono text-right text-foreground">{host.iiiHealth.tasks}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">Engine inactive</p>
                  )}
                </div>
              )}

              {/* Buzz Agents (Mac only) */}
              {host.id === "mac" && host.health !== "offline" && (
                <BuzzAgentsPanel />
              )}

              {/* Processes */}
              {(host.processes?.length ?? 0) > 0 && (
                <button
                  onClick={() => setExpandedProcs(procsOpen ? null : host.id)}
                  className="flex w-full items-center justify-between rounded-md px-1 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <span>Processes ({host.processes?.length ?? 0})</span>
                  {detailChevron(procsOpen)}
                </button>
              )}
              {procsOpen &&
                procs.map((p) => (
                  <div key={p.pid} className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1 text-[10px]">
                    <span className="truncate font-mono text-foreground">{p.command}</span>
                    <span className="ml-2 shrink-0 text-muted-foreground">{p.cpuPct?.toFixed(1)}% cpu</span>
                  </div>
                ))}

              {/* Containers */}
              {(host.containers?.length ?? 0) > 0 && (
                <button
                  onClick={() => setExpandedCtns(ctnsOpen ? null : host.id)}
                  className="flex w-full items-center justify-between rounded-md px-1 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <span>Containers ({host.containers?.length ?? 0})</span>
                  {detailChevron(ctnsOpen)}
                </button>
              )}
              {ctnsOpen &&
                ctns.map((c) => {
                  const state = ctnState[c.name];
                  const isPending = state === "stop-container" || state === "restart-container" || state === "remove-container";
                  const isOk = state?.startsWith("ok-");
                  const isErr = state?.startsWith("err-");
                  return (
                    <div key={c.name} className={`flex items-center justify-between rounded-md px-2 py-1 text-[10px] ${isErr ? "bg-red-100 dark:bg-red-950" : isOk ? "bg-emerald-50 dark:bg-emerald-950" : "bg-muted/30"}`}>
                      <span className={`truncate font-mono ${isPending ? "text-muted-foreground animate-pulse" : isErr ? "text-red-700 dark:text-red-300" : isOk ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"}`}>
                        {c.name}
                      </span>
                      {isPending && <span className="ml-2 shrink-0 text-amber-500 animate-pulse text-[9px]">⋯</span>}
                      {isOk && <span className="ml-2 shrink-0 text-emerald-500 text-[9px] font-semibold">✓</span>}
                      {isErr && <span className="ml-2 shrink-0 truncate max-w-[120px] text-red-500 text-[9px]" title={state.slice(4)}>{state.slice(4)}</span>}
                      {!isPending && !isOk && !isErr && (
                        <>
                          <span className="ml-2 shrink-0 text-muted-foreground">{c.status || "running"}</span>
                          {host.id === "zima" && (
                            <span className="ml-1 flex items-center gap-0.5">
                              <button type="button" onClick={() => void runCtnAction(host.id, c.name, "restart-container", "Restart")} className="rounded px-1 py-0.5 text-[9px] text-sky-600 hover:bg-sky-100 dark:text-sky-400 dark:hover:bg-sky-950" title="Restart container">↻</button>
                              <button type="button" onClick={() => void runCtnAction(host.id, c.name, "stop-container", "Stop")} className="rounded px-1 py-0.5 text-[9px] text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-950" title="Stop container">■</button>
                              {confirmRemove === c.name ? (
                                <>
                                  <button type="button" onClick={() => { void runCtnAction(host.id, c.name, "remove-container", "Remove"); setConfirmRemove(null); }} className="rounded px-1 py-0.5 text-[9px] font-semibold text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-950" title="Confirm remove">✓</button>
                                  <button type="button" onClick={() => setConfirmRemove(null)} className="rounded px-1 py-0.5 text-[9px] text-muted-foreground hover:text-foreground" title="Cancel">✕</button>
                                </>
                              ) : (
                                <button type="button" onClick={() => setConfirmRemove(c.name)} className="rounded px-1 py-0.5 text-[9px] text-red-500 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-950" title="Remove container">✕</button>
                              )}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      {/* ── Nomad Jobs ──────────────────────────────────────────────── */}
      {nomad && nomad.jobs.length > 0 && (
        <NomadJobsPanel
          nomad={nomad}
          expandedJob={expandedNomadJob}
          setExpandedJob={setExpandedNomadJob}
          dispatchState={dispatchState}
          onDispatch={(jobName) => {
            setDispatchState((prev) => ({ ...prev, [jobName]: "dispatching…" }));
            setStatusLine(`Dispatching ${jobName}…`);
            fetch("/api/compute/dispatch", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ jobName }),
            })
              .then((r) => r.json())
              .then((d) => {
                setDispatchState((prev) => ({
                  ...prev,
                  [jobName]: d.ok ? `ok:${d.message}` : `err:${d.message}`,
                }));
                setStatusLine(d.message);
                setTimeout(() => loadNomad(), 2000);
              })
              .catch((e) => {
                setDispatchState((prev) => ({
                  ...prev,
                  [jobName]: `err:${e.message}`,
                }));
              });
          }}
        />
      )}

      {/* Status line */}
      <p className="text-center text-[10px] text-muted-foreground">{statusLine}</p>
    </div>
  );
}
