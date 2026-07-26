"use client";

import { useEffect, useState, useCallback } from "react";

const TABS = ["Metrics", "Runs"] as const;
type Tab = (typeof TABS)[number];

// ── API types ──────────────────────────────────────────────────────

interface OverviewData {
  generatedAt: string;
  totals: Array<{ source: string; count: number }>;
  bySourceOutcome: Record<string, Record<string, number>>;
  weeklyTrends: Record<string, Array<{ week: string; total: number; successRate: number; driftRate: number }>>;
  topFailing: Array<{ project: string; total: number; success: number; fail: number }>;
  byAgent: Array<{ agentId: string; source: string; total: number; success: number; fail: number; drift: number }>;
  judged: { bySource: Record<string, number>; total: number; pctAutoJudged: number; pctHumanJudged: number };
  driftBySource: Record<string, { total: number; drifted: number; rate: number }>;
}

interface RunRow {
  id: string;
  source: string;
  agent_id: string | null;
  project: string | null;
  cwd: string | null;
  operation: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  prompt_count: number | null;
  error: string | null;
  outcome: string;
  outcome_score: number | null;
  outcome_source: string;
  drifted: boolean;
  dead_end: boolean;
  headline: string | null;
  summary: string | null;
  judged_at: string | null;
  raw_ref: string | null;
}

interface RunsData {
  rows: RunRow[];
  total: number;
  limit: number;
  offset: number;
}

// ── helpers ────────────────────────────────────────────────────────

const OUTCOME_BADGE: Record<string, { label: string; color: string }> = {
  success: { label: "OK", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  partial: { label: "PARTIAL", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  failed: { label: "FAIL", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  drifted: { label: "DRIFT", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  dead_end: { label: "DEAD", color: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300" },
  unknown: { label: "?", color: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" },
};

const SOURCE_COLORS: Record<string, string> = {
  "claude-code": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  pi: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  omp: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  codex: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  cursor: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  "open-webui": "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
};

const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "CC",
  pi: "PI",
  omp: "OMP",
  codex: "CDX",
  cursor: "CSR",
  "open-webui": "OWU",
};

function fmtDuration(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function truncate(text: string | null | undefined, max = 60): string {
  if (!text) return "—";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

// ── page ───────────────────────────────────────────────────────────

export default function RunsPage() {
  const [tab, setTab] = useState<Tab>("Metrics");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewErr, setOverviewErr] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const r = await fetch("/api/agent-runs/overview", { cache: "no-store" });
      if (r.ok) {
        setOverview(await r.json());
        setOverviewErr(null);
      } else {
        setOverviewErr(`HTTP ${r.status}`);
      }
    } catch (e) {
      setOverviewErr(String(e));
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto max-w-5xl px-3 pt-2">
          <div className="flex w-full">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 min-w-0 px-0.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                  tab === t
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={fetchOverview}
            className="absolute right-3 top-2.5 text-[10px] text-zinc-400 hover:text-zinc-600"
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-3 py-3">
        {tab === "Metrics" && (
          <MetricsTab overview={overview} overviewErr={overviewErr} />
        )}
        {tab === "Runs" && <RunsTab />}
      </div>
    </div>
  );
}

// ── Metrics Tab ────────────────────────────────────────────────────

function MetricsTab({
  overview,
  overviewErr,
}: {
  overview: OverviewData | null;
  overviewErr: string | null;
}) {
  if (overviewErr) {
    return <p className="py-12 text-center text-sm text-red-400">{overviewErr}</p>;
  }
  if (!overview) {
    return <p className="py-12 text-center text-sm text-zinc-400">Loading…</p>;
  }

  const totalRuns = overview.totals.reduce((s, t) => s + t.count, 0);
  const outBySource = overview.bySourceOutcome;

  // Build a combined outcome summary
  const outcomeSummary: Record<string, number> = {};
  for (const src of Object.values(outBySource)) {
    for (const [outcome, count] of Object.entries(src)) {
      outcomeSummary[outcome] = (outcomeSummary[outcome] || 0) + (count as number);
    }
  }
  const successTotal = outcomeSummary["success"] || 0;
  const driftTotal = outcomeSummary["drifted"] || 0;
  const failTotal = (outcomeSummary["failed"] || 0) + (outcomeSummary["dead_end"] || 0);
  const unknownTotal = outcomeSummary["unknown"] || 0;

  return (
    <div className="space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Total Runs</p>
          <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-200">{totalRuns}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950">
          <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Success</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{successTotal}</p>
          <p className="text-[10px] text-emerald-500">{fmtPct(successTotal / totalRuns)}</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950">
          <p className="text-[10px] text-orange-600 uppercase tracking-wider">Drifted</p>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{driftTotal}</p>
          <p className="text-[10px] text-orange-500">{fmtPct(driftTotal / totalRuns)}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
          <p className="text-[10px] text-red-600 uppercase tracking-wider">Failed/Dead</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{failTotal}</p>
          <p className="text-[10px] text-red-500">{fmtPct(failTotal / totalRuns)}</p>
        </div>
      </div>

      {/* Per-source breakdown */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2">By Source</p>
        <div className="space-y-2">
          {overview.totals.map((t) => {
            const outcomes = outBySource[t.source] || {};
            const srcTotal = t.count;
            const srcSuccess = outcomes["success"] || 0;
            const srcDrift = outcomes["drifted"] || 0;
            const srcFail = (outcomes["failed"] || 0) + (outcomes["dead_end"] || 0);
            return (
              <div key={t.source}>
                <div className="flex items-center justify-between text-xs">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SOURCE_COLORS[t.source] || "bg-zinc-100 text-zinc-600"}`}>
                    {t.source}
                  </span>
                  <span className="text-[10px] text-zinc-400">{t.count} runs</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden flex">
                  {srcSuccess > 0 && (
                    <div className="h-full bg-emerald-400" style={{ width: `${(srcSuccess / srcTotal) * 100}%` }} title={`${srcSuccess} success`} />
                  )}
                  {srcDrift > 0 && (
                    <div className="h-full bg-orange-400" style={{ width: `${(srcDrift / srcTotal) * 100}%` }} title={`${srcDrift} drifted`} />
                  )}
                  {srcFail > 0 && (
                    <div className="h-full bg-red-400" style={{ width: `${(srcFail / srcTotal) * 100}%` }} title={`${srcFail} failed/dead`} />
                  )}
                  {(outcomes["unknown"] || 0) > 0 && (
                    <div className="h-full bg-zinc-400 dark:bg-zinc-500" style={{ width: `${((outcomes["unknown"] || 0) / srcTotal) * 100}%` }} title={`${outcomes["unknown"] || 0} unknown`} />
                  )}
                </div>
                <div className="flex gap-2 mt-0.5 text-[10px]">
                  <span className="text-emerald-500">{fmtPct(srcSuccess / srcTotal)} ok</span>
                  <span className="text-orange-500">{fmtPct(srcDrift / srcTotal)} drift</span>
                  <span className="text-red-500">{fmtPct(srcFail / srcTotal)} fail</span>
                  {(outcomes["unknown"] || 0) > 0 && (
                    <span className="text-zinc-400">{fmtPct((outcomes["unknown"] || 0) / srcTotal)} ?</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly trends — sparkline-style bars per source */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Weekly Trends</p>
        {Object.entries(overview.weeklyTrends).map(([source, weeks]) => {
          const latest = weeks[0];
          return (
            <div key={source} className="mb-2 last:mb-0">
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">{source}</span>
                {latest && (
                  <span>
                    <span className="text-emerald-500">{fmtPct(latest.successRate)} ok</span>
                    {" · "}
                    <span className="text-orange-500">{fmtPct(latest.driftRate)} drift</span>
                  </span>
                )}
              </div>
              <div className="flex items-end gap-px h-8">
                {weeks.reverse().map((w, i) => {
                  const successH = w.successRate * 100;
                  const driftH = w.driftRate * 100;
                  return (
                    <div key={i} className="flex-1 min-w-0 h-full flex flex-col justify-end" title={`w${w.week}: ${w.total} runs, ${fmtPct(w.successRate)} ok, ${fmtPct(w.driftRate)} drift`}>
                      <div className="w-full bg-emerald-400/60 rounded-sm" style={{ height: `${Math.max(2, successH)}%` }} />
                      <div className="w-full bg-orange-400/60 rounded-sm" style={{ height: `${Math.max(2, driftH)}%` }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Top failing projects */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Top Failing Projects</p>
        {overview.topFailing.length === 0 ? (
          <p className="text-xs text-zinc-400">No projects with ≥3 runs and failures</p>
        ) : (
          <div className="space-y-1.5">
            {overview.topFailing.map((p) => (
              <div key={p.project} className="flex items-center justify-between text-xs">
                <span className="truncate flex-1 min-w-0 text-zinc-700 dark:text-zinc-300">{p.project}</span>
                <span className="ml-2 shrink-0 text-[10px]">
                  <span className="text-red-500">{p.fail} fail</span>
                  <span className="text-zinc-400"> / {p.total} total</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent breakdown */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2">By Agent</p>
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {overview.byAgent.map((a) => (
            <div key={`${a.agentId}-${a.source}`} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${SOURCE_COLORS[a.source] || "bg-zinc-100 text-zinc-600"}`}>
                  {SOURCE_LABELS[a.source] || a.source}
                </span>
                <span className="truncate text-zinc-700 dark:text-zinc-300">{a.agentId}</span>
              </div>
              <span className="ml-2 shrink-0 text-[10px]">
                <span className="text-emerald-500">{a.success} ok</span>
                {a.drift > 0 && <span className="text-orange-500"> · {a.drift} drift</span>}
                {a.fail > 0 && <span className="text-red-500"> · {a.fail} fail</span>}
                <span className="text-zinc-400"> / {a.total}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Judged status */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Judgment Status</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {overview.judged.total} judged runs:{" "}
          <span className="text-zinc-700 dark:text-zinc-300 font-medium">
            {overview.judged.bySource["hook"] ?? 0} hook
          </span>
          {" · "}
          <span className="text-zinc-700 dark:text-zinc-300 font-medium">
            {overview.judged.bySource["auto_judge"] ?? 0} auto
          </span>
          {" · "}
          <span className="text-zinc-700 dark:text-zinc-300 font-medium">
            {overview.judged.bySource["human"] ?? 0} human
          </span>
        </p>
      </div>
    </div>
  );
}

// ── Runs Tab ────────────────────────────────────────────────────────

function RunsTab() {
  const [data, setData] = useState<RunsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [outcome, setOutcome] = useState("");
  const [project, setProject] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchRuns = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50", offset: String(offset) });
      if (source) params.set("source", source);
      if (outcome) params.set("outcome", outcome);
      if (project.trim()) params.set("project", project.trim());
      const r = await fetch(`/api/agent-runs/list?${params}`, { cache: "no-store" });
      if (r.ok) {
        setData(await r.json());
        setErr(null);
      } else {
        setErr(`HTTP ${r.status}`);
      }
    } catch (e) {
      setErr(String(e));
    }
  }, [source, outcome, project, offset]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  return (
    <div className="space-y-2">
      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 items-end">
        <div>
          <label className="text-[10px] text-zinc-400 block">Source</label>
          <select value={source} onChange={(e) => { setSource(e.target.value); setOffset(0); }}
            className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <option value="">All</option>
            <option value="claude-code">Claude Code</option>
            <option value="pi">Pi</option>
            <option value="omp">OMP</option>
            <option value="cursor">Cursor</option>
            <option value="codex">Codex</option>
            <option value="open-webui">Open WebUI</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-400 block">Outcome</label>
          <select value={outcome} onChange={(e) => { setOutcome(e.target.value); setOffset(0); }}
            className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="drifted">Drifted</option>
            <option value="failed">Failed</option>
            <option value="dead_end">Dead End</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-400 block">Project</label>
          <input
            type="text"
            value={project}
            onChange={(e) => { setProject(e.target.value); setOffset(0); }}
            placeholder="filter…"
            className="w-28 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs text-zinc-700 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
        </div>
        <button onClick={fetchRuns}
          className="rounded-md border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
          Apply
        </button>
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      {/* Table */}
      {data && (
        <>
          <div className="text-[10px] text-zinc-400">
            {data.total} runs · showing {data.rows.length}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.rows.map((row) => (
                <div key={row.id}>
                  <button onClick={() => toggle(row.id)}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${OUTCOME_BADGE[row.outcome]?.color || OUTCOME_BADGE.unknown.color}`}>
                      {OUTCOME_BADGE[row.outcome]?.label || "?"}
                    </span>
                    <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${SOURCE_COLORS[row.source] || "bg-zinc-100 text-zinc-600"}`}>
                      {SOURCE_LABELS[row.source] || row.source}
                    </span>
                    <span className="truncate text-xs text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">
                      {row.headline || truncate(row.operation, 50) || truncate(row.summary, 50)}
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-400">
                      {row.drifted && <span className="text-orange-500 mr-1">↗</span>}
                      {row.dead_end && <span className="text-zinc-400 mr-1">☠</span>}
                      {fmtDate(row.started_at)}
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-300">{expanded.has(row.id) ? "▾" : "▸"}</span>
                  </button>
                  {expanded.has(row.id) && (
                    <div className="px-3 pb-2 space-y-1 border-t border-zinc-50 dark:border-zinc-800 pt-2">
                      <Detail label="ID" value={row.id} />
                      <Detail label="Agent" value={row.agent_id || "—"} />
                      <Detail label="Project" value={row.project || "—"} />
                      <Detail label="CWD" value={row.cwd || "—"} />
                      <Detail label="Operation" value={truncate(row.operation, 120)} />
                      <Detail label="Duration" value={fmtDuration(row.duration_ms)} />
                      <Detail label="Prompts" value={row.prompt_count != null ? String(row.prompt_count) : "—"} />
                      <Detail label="Error" value={row.error || "—"} />
                      <Detail label="Outcome Source" value={row.outcome_source} />
                      <Detail label="Score" value={row.outcome_score != null ? fmtPct(row.outcome_score) : "—"} />
                      {row.headline && <Detail label="Headline" value={row.headline} />}
                      {row.summary && <Detail label="Summary" value={row.summary} />}
                      <Detail label="Drifted" value={row.drifted ? "yes" : "no"} />
                      <Detail label="Dead End" value={row.dead_end ? "yes" : "no"} />
                      <Detail label="Judged" value={row.judged_at ? fmtDate(row.judged_at) : "—"} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1">
            <button
              onClick={() => setOffset(Math.max(0, offset - 50))}
              disabled={offset === 0}
              className="px-2 py-0.5 rounded border border-zinc-200 disabled:opacity-30 dark:border-zinc-700"
            >
              ← Prev
            </button>
            <span>
              {offset + 1}–{Math.min(offset + (data?.rows.length || 50), data?.total || 0)} of {data?.total || 0}
            </span>
            <button
              onClick={() => setOffset(offset + 50)}
              disabled={offset + 50 >= (data?.total || 0)}
              className="px-2 py-0.5 rounded border border-zinc-200 disabled:opacity-30 dark:border-zinc-700"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex text-[10px]">
      <span className="text-zinc-400 w-24 shrink-0">{label}</span>
      <span className="text-zinc-700 dark:text-zinc-300 break-all">{value}</span>
    </div>
  );
}
