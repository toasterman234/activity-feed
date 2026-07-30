"use client";

// Read-only view over perf_metrics. Polls /api/perf/summary rather than opening
// an Electric shape, so it costs nothing against the per-page shape budget
// (ADR-003). See docs/decisions/ADR-004-perf-monitoring.md.

import { useCallback, useEffect, useState } from "react";

const TABS = ["Vitals", "Measures", "Slowest"] as const;
type Tab = (typeof TABS)[number];

const WINDOWS: Array<{ label: string; hours: number }> = [
  { label: "1h", hours: 1 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
];

// Google's Core Web Vitals thresholds: [good, needs-improvement] upper bounds.
const VITAL_THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

type Rollup = {
  kind: string;
  route: string;
  name: string;
  count: number;
  p50: number;
  p75: number;
  p95: number;
  max: number;
  poor: number;
  good: number;
};

type Slow = {
  ts: string;
  kind: string;
  name: string;
  route: string;
  value: number;
  detail: Record<string, unknown> | null;
  device: string | null;
};

type Summary = {
  hours: number;
  route: string | null;
  totals: { entries: number; sessions: number; oldest: string | null; newest: string | null };
  vitals: Rollup[];
  measures: Rollup[];
  slowest: Slow[];
  routes: string[];
};

function fmt(name: string, value: number): string {
  if (name === "CLS") return value.toFixed(3);
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

// Vitals are scored against published thresholds; custom measures have no
// external baseline, so they're only flagged once they cross frame budgets.
function tone(kind: string, name: string, value: number): string {
  const limits = kind === "vital" ? VITAL_THRESHOLDS[name] : [50, 200];
  if (!limits) return "text-zinc-600 dark:text-zinc-300";
  if (value <= limits[0]) return "text-emerald-600 dark:text-emerald-400";
  if (value <= limits[1]) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export default function PerfPage() {
  const [tab, setTab] = useState<Tab>("Vitals");
  const [hours, setHours] = useState(24);
  const [route, setRoute] = useState("");
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ hours: String(hours) });
      if (route) qs.set("route", route);
      const r = await fetch(`/api/perf/summary?${qs}`, { cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [hours, route]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  const rows = tab === "Vitals" ? data?.vitals : tab === "Measures" ? data?.measures : [];

  return (
    <div className="pb-4">
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
        {data
          ? `${data.totals.entries.toLocaleString()} samples · ${data.totals.sessions} sessions · last ${data.hours}h`
          : "loading…"}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              onClick={() => setHours(w.hours)}
              className={`px-3 py-1 text-xs first:rounded-l-lg last:rounded-r-lg ${
                hours === w.hours
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <select
          value={route}
          onChange={(e) => setRoute(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-card px-2 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="">All routes</option>
          {data?.routes.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <div className="ml-auto flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1 text-xs ${
                tab === t
                  ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {tab !== "Slowest" && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Metric</th>
                <th className="px-3 py-2 font-medium">Route</th>
                <th className="px-3 py-2 text-right font-medium">n</th>
                <th className="px-3 py-2 text-right font-medium">p50</th>
                <th className="px-3 py-2 text-right font-medium">p75</th>
                <th className="px-3 py-2 text-right font-medium">p95</th>
                <th className="px-3 py-2 text-right font-medium">max</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr
                  key={`${r.kind}-${r.route}-${r.name}`}
                  className="border-t border-zinc-100 dark:border-zinc-800/60"
                >
                  <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-zinc-500 dark:text-zinc-400">{r.route}</td>
                  <td className="px-3 py-2 text-right text-zinc-500 dark:text-zinc-400">{r.count}</td>
                  <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-300">
                    {fmt(r.name, r.p50)}
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${tone(r.kind, r.name, r.p75)}`}>
                    {fmt(r.name, r.p75)}
                  </td>
                  <td className={`px-3 py-2 text-right ${tone(r.kind, r.name, r.p95)}`}>
                    {fmt(r.name, r.p95)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500 dark:text-zinc-400">
                    {fmt(r.name, r.max)}
                  </td>
                </tr>
              ))}
              {rows && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-zinc-400">
                    No samples yet. Browse the app, then come back here — entries flush every 10s or when
                    the tab is hidden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Slowest" && (
        <div className="space-y-1">
          {(data?.slowest ?? []).map((s, i) => (
            <div
              key={`${s.ts}-${i}`}
              className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{s.name}</span>
                <span className={`text-sm font-semibold ${tone(s.kind, s.name, s.value)}`}>
                  {fmt(s.name, s.value)}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="font-mono">{s.route}</span>
                <span>{new Date(s.ts).toLocaleString()}</span>
                {s.device && <span>{s.device}</span>}
                {s.detail && <span className="font-mono">{JSON.stringify(s.detail)}</span>}
              </div>
            </div>
          ))}
          {data?.slowest.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-zinc-400">No measure spans recorded yet.</p>
          )}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-400">
        Vitals come from next/web-vitals; measures come from startMeasure() calls in the app. Colors
        use Core Web Vitals thresholds for vitals, and 50ms / 200ms frame budgets for measures. To
        stop collection on this device: <code>localStorage.setItem(&quot;perf:off&quot;, &quot;1&quot;)</code>. For
        component-level render counts, use React Scan in dev (ADR-002).
      </p>
    </div>
  );
}
