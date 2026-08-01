"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, RefreshCcw } from "lucide-react";
import {
  useV2Runs,
  fmtPct,
  fmtDuration,
  fmtDateShort,
  OUTCOME_BADGE,
  OUTCOME_LABEL,
  SOURCE_COLORS,
  SOURCE_LABELS,
} from "../_hooks/useV2Runs";

const TABS = ["Metrics", "Runs"] as const;
type Tab = (typeof TABS)[number];

// ── helpers ──

function MetricBar({ value, label }: { value: number; label: string }) {
  const color = value >= 80 ? "bg-red-400" : value >= 60 ? "bg-amber-400" : value >= 35 ? "bg-sky-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-12 text-right font-mono tabular-nums text-[var(--foreground)]">{value}%</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-10 text-left text-[var(--muted-foreground)]">{label}</span>
    </div>
  );
}

function Truncate({ text, max = 60 }: { text: string | null | undefined; max?: number }) {
  if (!text) return <span>—</span>;
  if (text.length <= max) return <span>{text}</span>;
  return <span>{text.slice(0, max)}…</span>;
}

// ── Metrics tab ──

function MetricsTab() {
  const { overview, overviewErr, fetchOverview } = useV2Runs();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchOverview();
    setRefreshing(false);
  };

  if (overviewErr) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">{overviewErr}</div>
      </div>
    );
  }
  if (!overview) {
    return <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">Loading metrics…</p>;
  }

  const totalRuns = overview.totals.reduce((s, t) => s + t.count, 0);
  const outBySource = overview.bySourceOutcome;
  const outcomeSummary: Record<string, number> = {};
  for (const src of Object.values(outBySource)) {
    for (const [o, c] of Object.entries(src)) {
      outcomeSummary[o] = (outcomeSummary[o] || 0) + (c as number);
    }
  }
  const successTotal = outcomeSummary["success"] || 0;
  const driftTotal = outcomeSummary["drifted"] || 0;
  const failTotal = (outcomeSummary["failed"] || 0) + (outcomeSummary["dead_end"] || 0);

  return (
    <div className="space-y-2">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {new Date(overview.generatedAt).toLocaleTimeString()}
        </span>
        <button onClick={handleRefresh} disabled={refreshing} className="rounded-md p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          <RefreshCcw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
          <p className="text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">Total</p>
          <p className="text-lg font-bold text-[var(--foreground)]">{totalRuns}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
          <p className="text-[9px] uppercase tracking-wider text-emerald-600">Success</p>
          <p className="text-lg font-bold text-emerald-700">{successTotal}</p>
          <p className="text-[9px] text-emerald-500">{fmtPct(successTotal / totalRuns)}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
          <p className="text-[9px] uppercase tracking-wider text-amber-600">Drifted</p>
          <p className="text-lg font-bold text-amber-700">{driftTotal}</p>
          <p className="text-[9px] text-amber-500">{fmtPct(driftTotal / totalRuns)}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-2">
          <p className="text-[9px] uppercase tracking-wider text-red-600">Failed</p>
          <p className="text-lg font-bold text-red-700">{failTotal}</p>
          <p className="text-[9px] text-red-500">{fmtPct(failTotal / totalRuns)}</p>
        </div>
      </div>

      {/* By source */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
        <p className="mb-2 text-[11px] font-semibold text-[var(--foreground)]">By Source</p>
        <div className="space-y-2">
          {overview.totals.map((t) => {
            const outcomes = outBySource[t.source] || {};
            const srcTotal = t.count;
            const srcSuccess = outcomes["success"] || 0;
            const srcDrift = outcomes["drifted"] || 0;
            const srcFail = (outcomes["failed"] || 0) + (outcomes["dead_end"] || 0);
            return (
              <div key={t.source}>
                <div className="flex items-center justify-between text-[10px]">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${SOURCE_COLORS[t.source] || "bg-[var(--muted)]"}`}>
                    {t.source}
                  </span>
                  <span className="text-[var(--muted-foreground)]">{t.count} runs</span>
                </div>
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                  {srcSuccess > 0 && <div className="h-full bg-emerald-400" style={{ width: `${(srcSuccess / srcTotal) * 100}%` }} />}
                  {srcDrift > 0 && <div className="h-full bg-amber-400" style={{ width: `${(srcDrift / srcTotal) * 100}%` }} />}
                  {srcFail > 0 && <div className="h-full bg-red-400" style={{ width: `${(srcFail / srcTotal) * 100}%` }} />}
                </div>
                <div className="mt-0.5 flex gap-2 text-[9px]">
                  <span className="text-emerald-500">{fmtPct(srcSuccess / srcTotal)} ok</span>
                  <span className="text-amber-500">{fmtPct(srcDrift / srcTotal)} drift</span>
                  <span className="text-red-500">{fmtPct(srcFail / srcTotal)} fail</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top failing */}
      {overview.topFailing.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
          <p className="mb-1.5 text-[11px] font-semibold text-[var(--foreground)]">Top Failing</p>
          <div className="space-y-1">
            {overview.topFailing.slice(0, 6).map((p) => (
              <div key={p.project} className="flex items-center justify-between text-[10px]">
                <span className="truncate text-[var(--foreground)]">{p.project}</span>
                <span className="ml-2 shrink-0">
                  <span className="text-red-500">{p.fail} fail</span>
                  <span className="text-[var(--muted-foreground)]"> / {p.total}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Runs tab ──

function RunsTab() {
  const { runs, runsTotal, runsErr, source, outcome, project, offset, setFilter, setOffset, fetchRuns } = useV2Runs();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  return (
    <div className="space-y-2">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-1">
        <select value={source} onChange={(e) => setFilter("source", e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-1 text-[10px] text-[var(--foreground)]">
          <option value="">All sources</option>
          <option value="claude-code">Claude Code</option>
          <option value="pi">Pi</option>
          <option value="omp">OMP</option>
          <option value="cursor">Cursor</option>
          <option value="codex">Codex</option>
          <option value="open-webui">Open WebUI</option>
        </select>
        <select value={outcome} onChange={(e) => setFilter("outcome", e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-1 text-[10px] text-[var(--foreground)]">
          <option value="">All outcomes</option>
          <option value="success">Success</option>
          <option value="drifted">Drifted</option>
          <option value="failed">Failed</option>
          <option value="dead_end">Dead End</option>
          <option value="unknown">Unknown</option>
        </select>
        <span className="ml-auto text-[10px] text-[var(--muted-foreground)]">
          {runsTotal} runs
        </span>
      </div>

      {runsErr && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] text-red-600">{runsErr}</div>}

      {/* Run rows */}
      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
        {runs.map((row) => (
          <div key={row.id}>
            <button
              onClick={() => toggle(row.id)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-[var(--muted)]"
            >
              <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${OUTCOME_BADGE[row.outcome] || OUTCOME_BADGE.unknown}`}>
                {OUTCOME_LABEL[row.outcome] || "?"}
              </span>
              <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${SOURCE_COLORS[row.source] || "bg-[var(--muted)]"}`}>
                {SOURCE_LABELS[row.source] || row.source}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--foreground)]">
                {row.headline || row.summary || row.operation || row.id?.slice(0, 8)}
              </span>
              <span className="shrink-0 text-[9px] text-[var(--muted-foreground)]">
                {row.drifted && <span className="mr-0.5 text-amber-500">↗</span>}
                {row.dead_end && <span className="mr-0.5 text-[var(--muted-foreground)]">☠</span>}
                {fmtDateShort(row.started_at)}
              </span>
              <span className="shrink-0 text-[9px] text-[var(--muted-foreground)]">
                {expanded.has(row.id) ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              </span>
            </button>
            {expanded.has(row.id) && (
              <div className="space-y-1 border-t border-[var(--border)] px-3 pb-2 pt-1.5">
                <Detail label="ID" value={row.id} />
                <Detail label="Agent" value={row.agent_id || "—"} />
                <Detail label="Project" value={row.project || "—"} />
                <Detail label="Operation" value={row.operation || "—"} max={100} />
                <Detail label="Duration" value={fmtDuration(row.duration_ms)} />
                <Detail label="Source" value={row.outcome_source || "—"} />
                {row.headline && <Detail label="Headline" value={row.headline} />}
                {row.summary && <Detail label="Summary" value={row.summary} />}
                <div className="flex gap-3 pt-1">
                  <span className="text-[9px] text-[var(--muted-foreground)]">
                    Drifted: <span className={row.drifted ? "text-amber-500" : ""}>{row.drifted ? "yes" : "no"}</span>
                  </span>
                  <span className="text-[9px] text-[var(--muted-foreground)]">
                    Dead end: <span className={row.dead_end ? "text-[var(--muted-foreground)]" : ""}>{row.dead_end ? "yes" : "no"}</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
        {runs.length === 0 && !runsErr && (
          <div className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">No runs found.</div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
        <button
          onClick={() => setOffset(Math.max(0, offset - 30))}
          disabled={offset === 0}
          className="rounded-md border border-[var(--border)] px-2 py-0.5 disabled:opacity-30"
        >
          ← Prev
        </button>
        <span>
          {offset + 1}–{Math.min(offset + runs.length, runsTotal)} of {runsTotal}
        </span>
        <button
          onClick={() => setOffset(offset + 30)}
          disabled={offset + 30 >= runsTotal}
          className="rounded-md border border-[var(--border)] px-2 py-0.5 disabled:opacity-30"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function Detail({ label, value, max }: { label: string; value: string; max?: number }) {
  return (
    <div className="flex text-[10px]">
      <span className="w-20 shrink-0 text-[var(--muted-foreground)]">{label}</span>
      <span className="min-w-0 break-all text-[var(--foreground)]">{max ? <Truncate text={value} max={max} /> : value}</span>
    </div>
  );
}

// ── Main view ──

export default function RunsView() {
  const [tab, setTab] = useState<Tab>("Metrics");

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--muted-foreground)]">Runs</p>
        <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">Agent run history</h2>
      </div>

      {/* Tab bar */}
      <div className="flex rounded-lg bg-[var(--muted)] p-0.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
              tab === t
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Metrics" ? <MetricsTab /> : <RunsTab />}
    </div>
  );
}
