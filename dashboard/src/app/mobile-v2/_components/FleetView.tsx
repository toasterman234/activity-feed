"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Cpu, HardDrive, MemoryStick, RefreshCcw, Terminal } from "lucide-react";
import type { FleetActionId, FleetHost, FleetSnapshot } from "@/lib/fleet";
import { useV2Fleet } from "../_hooks/useV2Fleet";

// ── tiny helpers ──

function healthColor(h: FleetHost["health"]) {
  switch (h) {
    case "healthy": return "bg-emerald-400";
    case "warn": return "bg-amber-400";
    case "cool": return "bg-sky-400";
    default: return "bg-zinc-400";
  }
}

function metricBar(value: number) {
  const c = value >= 80 ? "bg-red-400" : value >= 60 ? "bg-amber-400" : value >= 35 ? "bg-sky-400" : "bg-emerald-400";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
      <div className={`h-full rounded-full ${c}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

// ── Host card ──

function HostCard({
  host,
  snapshot,
  loading,
  containerState,
  confirmRemove,
  setConfirmRemove,
  onAction,
  onContainerAction,
  onRefresh,
}: {
  host: FleetHost;
  snapshot: FleetSnapshot | null;
  loading: Record<string, boolean>;
  containerState: Record<string, string>;
  confirmRemove: string | null;
  setConfirmRemove: (name: string | null) => void;
  onAction: (hostId: string, action: string, label: string) => void;
  onContainerAction: (hostId: string, containerName: string, action: FleetActionId) => void;
  onRefresh: (hostId: string) => void;
}) {
  const [showProcs, setShowProcs] = useState(false);
  const [showCtns, setShowCtns] = useState(false);

  // Merge static config + live snapshot
  const live = snapshot?.hosts?.find((h) => h.id === host.id);
  const merged = live ? { ...host, ...live } : host;

  const procs = (merged.processes || []).slice(0, 8);
  const ctns = (merged.containers || []).slice(0, 8);

  return (
    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`inline-block size-2 shrink-0 rounded-full ${healthColor(merged.health)}`} />
            <span className="truncate text-sm font-semibold text-[var(--foreground)]">{merged.name}</span>
          </div>
          <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{merged.role}</p>
        </div>
        <button
          onClick={() => onRefresh(host.id)}
          className="shrink-0 rounded-md p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          title="Refresh"
        >
          <RefreshCcw className="size-3" />
        </button>
      </div>

      {/* Metrics */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[10px]">
          <Cpu className="size-3 shrink-0 text-[var(--muted-foreground)]" />
          <span className="w-8 text-right font-mono tabular-nums text-[var(--foreground)]">{merged.cpu}%</span>
          {metricBar(merged.cpu)}
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <MemoryStick className="size-3 shrink-0 text-[var(--muted-foreground)]" />
          <span className="w-8 text-right font-mono tabular-nums text-[var(--foreground)]">{merged.memory}%</span>
          {metricBar(merged.memory)}
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <HardDrive className="size-3 shrink-0 text-[var(--muted-foreground)]" />
          <span className="w-8 text-right font-mono tabular-nums text-[var(--foreground)]">{merged.storage}%</span>
          {metricBar(merged.storage)}
        </div>
      </div>

      {/* Services */}
      {merged.services.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {merged.services.map((s) => (
            <span key={s} className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-1.5 py-0.5 text-[9px] text-[var(--foreground)]">{s}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1">
        {merged.controls.map((c) => {
          const key = `${host.id}:${c.action}`;
          return (
            <button
              key={c.label}
              type="button"
              disabled={loading[key]}
              onClick={() => onAction(host.id, c.action, c.label)}
              className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
            >
              {loading[key] ? "…" : c.label}
            </button>
          );
        })}
      </div>

      {/* Dagu link */}
      {merged.dagu?.ok && merged.dagu?.url && (
        <a
          href={merged.dagu.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400"
        >
          <span className="size-1.5 rounded-full bg-purple-400" />
          Dagu{merged.dagu.dags ? ` · ${merged.dagu.dags} DAGs` : ""}
        </a>
      )}

      {/* Processes toggle */}
      {(merged.processes?.length ?? 0) > 0 && (
        <button
          onClick={() => setShowProcs(!showProcs)}
          className="flex w-full items-center justify-between text-[10px] text-[var(--muted-foreground)]"
        >
          <span>Processes ({merged.processes?.length ?? 0})</span>
          <span>{showProcs ? "▾" : "▸"}</span>
        </button>
      )}
      {showProcs && (
        <div className="space-y-0.5">
          {procs.map((p) => (
            <div key={p.pid} className="flex items-center justify-between rounded-md bg-[var(--muted)] px-2 py-1 text-[10px]">
              <span className="truncate font-mono text-[var(--foreground)]">{p.command}</span>
              <span className="ml-2 shrink-0 text-[var(--muted-foreground)]">{p.cpuPct?.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Containers toggle */}
      {(merged.containers?.length ?? 0) > 0 && (
        <button
          onClick={() => setShowCtns(!showCtns)}
          className="flex w-full items-center justify-between text-[10px] text-[var(--muted-foreground)]"
        >
          <span>Containers ({merged.containers?.length ?? 0})</span>
          <span>{showCtns ? "▾" : "▸"}</span>
        </button>
      )}
      {showCtns && (
        <div className="space-y-0.5">
          {ctns.map((c) => {
            const state = containerState[c.name];
            const isPending = state === "stop-container" || state === "restart-container" || state === "remove-container";
            const isOk = state?.startsWith("ok-");
            const isErr = state?.startsWith("err-");

            return (
              <div
                key={c.name}
                className={`rounded-md px-2 py-1 text-[10px] ${
                  isErr ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
                  isOk ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
                  "bg-[var(--muted)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-mono">{c.name}</span>
                  {isPending ? (
                    <span className="shrink-0 text-[9px] text-amber-500">⋯</span>
                  ) : isOk ? (
                    <span className="shrink-0 text-[9px] font-semibold text-emerald-500">✓</span>
                  ) : isErr ? (
                    <span className="max-w-[120px] shrink-0 truncate text-[9px]" title={state.slice(4)}>{state.slice(4)}</span>
                  ) : (
                    <span className="shrink-0 text-[var(--muted-foreground)]">{c.status || "running"}</span>
                  )}
                </div>
                {!isPending && !isOk && !isErr && host.id === "zima" && (
                  <div className="mt-1 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onContainerAction(host.id, c.name, "restart-container")}
                      className="rounded px-1 py-0.5 text-[9px] text-sky-600 hover:bg-sky-100 dark:text-sky-400 dark:hover:bg-sky-950"
                      title="Restart container"
                    >
                      ↻
                    </button>
                    <button
                      type="button"
                      onClick={() => onContainerAction(host.id, c.name, "stop-container")}
                      className="rounded px-1 py-0.5 text-[9px] text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-950"
                      title="Stop container"
                    >
                      ■
                    </button>
                    {confirmRemove === c.name ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onContainerAction(host.id, c.name, "remove-container");
                            setConfirmRemove(null);
                          }}
                          className="rounded px-1 py-0.5 text-[9px] font-semibold text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-950"
                          title="Confirm remove"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(null)}
                          className="rounded px-1 py-0.5 text-[9px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(c.name)}
                        className="rounded px-1 py-0.5 text-[9px] text-red-500 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-950"
                        title="Remove container"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main view ──

export default function FleetView() {
  const {
    snapshot,
    error,
    lastUpdated,
    macHealth,
    poolCmd,
    setPoolCmd,
    poolStatus,
    poolMessage,
    poolOutput,
    actionLoading,
    containerState,
    runAction,
    runPoolCommand,
    runContainerAction,
  } = useV2Fleet();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const hosts = useMemo(() => snapshot?.hosts || [], [snapshot]);

  const handleRefresh = (hostId: string) => {
    void runAction(hostId, "inspect", "Inspect");
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--muted-foreground)]">Fleet</p>
          <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Connecting…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${
            macHealth === "healthy" ? "bg-emerald-100 text-emerald-700" :
            macHealth === "overloaded" ? "bg-red-100 text-red-700" :
            "bg-[var(--muted)] text-[var(--muted-foreground)]"
          }`}>
            Mac {macHealth}
          </span>
          <Link href="/mobile-v2/config" className="text-[10px] text-[var(--primary)]">
            Models
          </Link>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          {error}
        </div>
      )}

      {/* Pool run */}
      <div className="space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="flex items-center gap-2">
          <Terminal className="size-3 text-[var(--primary)]" />
          <span className="text-[11px] font-semibold text-[var(--foreground)]">Run Command</span>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); void runPoolCommand(); }}
          className="flex gap-1.5"
        >
          <input
            type="text"
            value={poolCmd}
            onChange={(e) => setPoolCmd(e.target.value)}
            placeholder="python script.py | hostname"
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-1.5 text-[11px] font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
          />
          <button
            type="submit"
            disabled={!poolCmd.trim() || poolStatus === "submitting" || poolStatus === "running"}
            className="shrink-0 rounded-md bg-[var(--primary)] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {poolStatus === "submitting" || poolStatus === "running" ? "…" : "Run"}
          </button>
        </form>
        {poolMessage && (
          <p className={`text-[10px] ${poolStatus === "error" ? "text-red-500" : poolStatus === "done" ? "text-emerald-600" : "text-[var(--muted-foreground)]"}`}>
            {poolStatus === "submitting" && "⋯"} {poolStatus === "running" && "⋯"} {poolMessage}
          </p>
        )}
        {poolOutput && (
          <pre className="max-h-24 overflow-auto rounded-md bg-[var(--muted)] p-2 text-[10px] font-mono text-[var(--foreground)] whitespace-pre-wrap">
            {poolOutput}
          </pre>
        )}
      </div>

      {/* Host cards */}
      <div className="space-y-2">
        {hosts.map((host) => (
          <HostCard
            key={host.id}
            host={host}
            snapshot={snapshot}
            loading={actionLoading}
            containerState={containerState}
            confirmRemove={confirmRemove}
            setConfirmRemove={setConfirmRemove}
            onAction={runAction}
            onContainerAction={runContainerAction}
            onRefresh={handleRefresh}
          />
        ))}
        {!snapshot && !error && (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">Loading fleet…</p>
        )}
      </div>
    </div>
  );
}
