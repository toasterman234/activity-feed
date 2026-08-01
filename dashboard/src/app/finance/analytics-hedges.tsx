"use client";

import { useCallback, useEffect, useState } from "react";
import {
  submitRun,
  getRun,
  getCandidates,
  createSnapshot,
  type RunStatus,
  type HedgeCandidate,
} from "@/lib/hedge-api";

// ── Poll helper ──
function usePoll<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  enabled: boolean,
): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      try {
        const result = await fetcher();
        if (alive) setData(result);
      } catch {
        // retry next tick
      }
    };
    tick();
    const interval = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [enabled, intervalMs]);

  return data;
}

// ── Formatters ──
function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtScore(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(0)}`;
}

const STRATEGY_BADGE: Record<string, string> = {
  protective_put: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  covered_call: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  collar: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const STRATEGY_LABEL: Record<string, string> = {
  protective_put: "Protective Put",
  covered_call: "Covered Call",
  collar: "Collar",
};

export default function AnalyticsHedges() {
  const [runId, setRunId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<HedgeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Poll run status
  const runStatus = usePoll<RunStatus>(
    () => getRun(runId!),
    2000,
    !!runId,
  );

  // Load candidates when run completes
  useEffect(() => {
    if (runStatus?.status === "complete" && runId) {
      getCandidates(runId).then(setCandidates).catch(() => {});
    }
  }, [runStatus?.status, runId]);

  const handleScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCandidates([]);
    try {
      const { run_id } = await submitRun();
      setRunId(run_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setLoading(false);
    }
  }, []);

  const isRunning = runStatus?.status === "running" || runStatus?.status === "pending";

  return (
    <div className="space-y-4">
      {/* Header + scan button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-zinc-500">Hedge Scanner</h2>
          <p className="text-[11px] text-zinc-400">
            Scan portfolio for protective put, covered call, and collar opportunities
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={isRunning}
          className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
            isRunning
              ? "bg-zinc-200 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600"
              : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          }`}
        >
          {isRunning ? "Scanning…" : loading ? "Starting…" : "Run Hedge Scan"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Progress */}
      {isRunning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-400">
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/30">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-amber-500" />
          </div>
          Scanning {runStatus?.summary?.symbols_scanned?.length ?? "—"} symbols across hedge strategies…
        </div>
      )}

      {/* Completed run summary */}
      {runStatus?.status === "complete" && runStatus.summary && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-900/30 dark:bg-emerald-900/10">
          <span className="text-emerald-700 dark:text-emerald-400">
            {runStatus.summary.total_candidates} candidates found from{" "}
            {runStatus.summary.symbols_scanned.length} symbols · Top score:{" "}
            {fmtScore(runStatus.summary.top_score)}
          </span>
        </div>
      )}

      {runStatus?.status === "failed" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400">
          Scan failed: {runStatus.error}
        </div>
      )}

      {/* No candidates yet */}
      {!candidates.length && !isRunning && !error && (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-sm text-zinc-400">
          <div className="text-4xl">🛡️</div>
          <p>Run a hedge scan to find opportunities</p>
          <p className="text-[11px] text-zinc-500">
            Generates protective puts, covered calls, and collars from live market data
          </p>
        </div>
      )}

      {/* Candidate cards */}
      <div className="space-y-3">
        {candidates.map((c) => {
          const expanded = expandedId === c.candidate_id;
          return (
            <div
              key={c.candidate_id}
              className={`rounded-lg border bg-card transition-colors dark:bg-zinc-900 ${
                expanded
                  ? "border-zinc-300 ring-1 ring-zinc-300 dark:border-zinc-700 dark:ring-zinc-700"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <button
                onClick={() => setExpandedId(expanded ? null : c.candidate_id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {c.symbol}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STRATEGY_BADGE[c.strategy] || "bg-zinc-100 text-zinc-600"}`}
                    >
                      {STRATEGY_LABEL[c.strategy] || c.strategy}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    Rank #{c.rank} · Score {fmtScore(c.score)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    {fmt((c.metrics?.net_cost as number) ?? (c as any).net_cost)}
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    {fmtPct((c.metrics?.dte as number))} DTE
                  </p>
                </div>
              </button>

              {expanded && (
                <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                  {/* Legs */}
                  <div className="mb-3">
                    <p className="mb-2 text-[11px] font-medium text-zinc-500">Legs</p>
                    <div className="space-y-1.5">
                      {c.legs.map((leg, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded bg-zinc-50 px-3 py-1.5 text-xs dark:bg-zinc-800/50"
                        >
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            {leg.leg_type === "underlying"
                              ? `Long ${c.symbol}`
                              : `${leg.leg_type === "long_put" ? "Long Put" : "Short Call"} $${leg.strike?.toFixed(2)}`}
                          </span>
                          <span className="font-mono text-zinc-500">
                            {leg.quantity > 0 ? `${leg.quantity.toLocaleString()} sh` : `${Math.abs(leg.quantity).toLocaleString()} sh`}
                            {leg.estimated_price != null && (
                              <> @ {fmt(leg.estimated_price)}</>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Greeks summary */}
                  {c.legs.some((l) => l.delta != null) && (
                    <div className="mb-3">
                      <p className="mb-1.5 text-[11px] font-medium text-zinc-500">Greeks</p>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          ["Delta", c.legs.reduce((s, l) => s + (l.delta ?? 0) * (l.quantity ?? 0), 0)],
                          ["Gamma", c.legs.reduce((s, l) => s + (l.gamma ?? 0) * (l.quantity ?? 0), 0)],
                          ["Theta", c.legs.reduce((s, l) => s + (l.theta ?? 0) * (l.quantity ?? 0), 0)],
                          ["Vega", c.legs.reduce((s, l) => s + (l.vega ?? 0) * (l.quantity ?? 0), 0)],
                        ].map(([label, val]) => (
                          <div key={label} className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/50">
                            <p className="text-[10px] text-zinc-400">{label}</p>
                            <p className="text-xs font-mono font-medium text-zinc-700 dark:text-zinc-300">
                              {typeof val === "number" ? val.toFixed(3) : "—"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    {c.metrics?.strike_pct != null && (
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Strike</span>
                        <span className="font-mono text-zinc-600 dark:text-zinc-400">
                          {fmtPct(c.metrics.strike_pct as number)} OTM
                        </span>
                      </div>
                    )}
                    {c.metrics?.iv != null && (
                      <div className="flex justify-between">
                        <span className="text-zinc-400">IV</span>
                        <span className="font-mono text-zinc-600 dark:text-zinc-400">
                          {fmtPct(c.metrics.iv as number)}
                        </span>
                      </div>
                    )}
                    {c.metrics?.oi != null && (
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Open Int</span>
                        <span className="font-mono text-zinc-600 dark:text-zinc-400">
                          {(c.metrics.oi as number)?.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {c.metrics?.put_cost != null && (
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Put Cost</span>
                        <span className="font-mono text-zinc-600 dark:text-zinc-400">
                          {fmt(c.metrics.put_cost as number)}
                        </span>
                      </div>
                    )}
                    {c.metrics?.call_credit != null && (
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Call Credit</span>
                        <span className="font-mono text-zinc-600 dark:text-zinc-400">
                          {fmt(c.metrics.call_credit as number)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
