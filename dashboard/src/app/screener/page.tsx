"use client";

import { useEffect, useState } from "react";
import { getVRPScan, type VRPResult } from "../../lib/market-lake";

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default function ScreenerPage() {
  const [results, setResults] = useState<VRPResult[]>([]);
  const [minIvr, setMinIvr] = useState(0.3);
  const [topN, setTopN] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getVRPScan(minIvr, topN);
      setResults(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runScan(); }, []);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Min IV Rank</label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={minIvr}
              onChange={(e) => setMinIvr(Number(e.target.value))}
              className="w-24 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Top N</label>
            <input
              type="number"
              min={5}
              max={100}
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              className="w-24 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            />
          </div>
          <button
            onClick={runScan}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? "Scanning…" : "Run Scan"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </section>

      {/* Results table */}
      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-500">
            VRP Scan · {results.length} symbols
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400 dark:border-zinc-800">
                <th className="sticky left-0 bg-white px-6 py-2 font-medium dark:bg-zinc-900">
                  Symbol
                </th>
                <th className="px-6 py-2 font-medium">Sector</th>
                <th className="px-6 py-2 text-right font-medium">Mkt Cap</th>
                <th className="px-6 py-2 text-right font-medium">IVR</th>
                <th className="px-6 py-2 text-right font-medium">VRP 30d</th>
                <th className="px-6 py-2 text-right font-medium">IV 30d</th>
                <th className="px-6 py-2 text-right font-medium">HV 30d</th>
                <th className="px-6 py-2 text-right font-medium">Term Slope</th>
                <th className="px-6 py-2 text-right font-medium">Put Skew</th>
                <th className="px-6 py-2 text-right font-medium">P/C Vol</th>
                <th className="px-6 py-2 font-medium">Vol Regime</th>
                <th className="px-6 py-2 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr
                  key={r.symbol}
                  className="border-b border-zinc-50 dark:border-zinc-800/50"
                >
                  <td className="sticky left-0 bg-white px-6 py-2.5 font-medium text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                    {r.symbol}
                  </td>
                  <td className="px-6 py-2.5 text-zinc-400">{r.sector}</td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-600 dark:text-zinc-400">
                    {r.mkt_cap_b != null ? `$${r.mkt_cap_b.toFixed(1)}B` : "—"}
                  </td>
                  <td
                    className={`px-6 py-2.5 text-right font-mono ${
                      (r.ivr_252d ?? 0) >= 0.5 ? "text-amber-500" : "text-zinc-600"
                    }`}
                  >
                    {fmtPct(r.ivr_252d)}
                  </td>
                  <td
                    className={`px-6 py-2.5 text-right font-mono ${
                      (r.vrp_30d ?? 0) > 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {fmtPct(r.vrp_30d)}
                  </td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-600 dark:text-zinc-400">
                    {fmtPct(r.iv_30d)}
                  </td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-600 dark:text-zinc-400">
                    {fmtPct(r.hv30)}
                  </td>
                  <td
                    className={`px-6 py-2.5 text-right font-mono ${
                      (r.ts_slope_30_60 ?? 0) > 0
                        ? "text-emerald-600"
                        : "text-amber-500"
                    }`}
                  >
                    {fmtPct(r.ts_slope_30_60)}
                  </td>
                  <td
                    className={`px-6 py-2.5 text-right font-mono ${
                      (r.put_skew_25d ?? 0) < 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {fmtPct(r.put_skew_25d)}
                  </td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-600 dark:text-zinc-400">
                    {r.pc_volume_ratio?.toFixed(2)}
                  </td>
                  <td className="px-6 py-2.5 text-zinc-400">{r.vol_regime}</td>
                  <td className="px-6 py-2.5 text-zinc-400">{r.trend_regime}</td>
                </tr>
              ))}
              {results.length === 0 && !loading && (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-zinc-400">
                    No results — try lowering the IV rank threshold.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
