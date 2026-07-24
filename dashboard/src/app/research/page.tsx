"use client";

import { useEffect, useState } from "react";
import {
  getStrategies,
  getFindings,
  type StrategyCard,
  type ResearchFinding,
} from "../../lib/market-lake";

const STRATEGY_COLORS: Record<string, string> = {
  wheel: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "option-signal-equity": "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "momentum-rotation": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "income-etf": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  archived: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

export default function ResearchPage() {
  const [strategies, setStrategies] = useState<StrategyCard[]>([]);
  const [findings, setFindings] = useState<ResearchFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getStrategies(), getFindings()])
      .then(([s, f]) => {
        setStrategies(s);
        setFindings(f);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Strategies */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Strategies</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {strategies.map((s) => (
            <div
              key={s.strategy}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-zinc-800 capitalize dark:text-zinc-200">
                  {s.strategy.replace(/-/g, " ")}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.status] ?? "bg-zinc-100 text-zinc-500"}`}
                >
                  {s.status}
                </span>
              </div>
              {s.verdict_mix && Object.keys(s.verdict_mix).length > 0 && (
                <div className="mt-2 flex gap-2 text-xs text-zinc-400">
                  {Object.entries(s.verdict_mix).map(([k, v]) => (
                    <span key={k}>
                      {k}: <span className="font-medium text-zinc-600 dark:text-zinc-300">{v}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {strategies.length === 0 && !loading && (
            <p className="col-span-2 py-8 text-center text-sm text-zinc-400">
              No strategy data — check Market Lake API.
            </p>
          )}
        </div>
      </section>

      {/* Findings */}
      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-500">
            Research Findings · {findings.length}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400 dark:border-zinc-800">
                <th className="px-6 py-2 font-medium">Date</th>
                <th className="px-6 py-2 font-medium">Strategy</th>
                <th className="px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr
                  key={f.finding_key}
                  className="border-b border-zinc-50 dark:border-zinc-800/50"
                >
                  <td className="px-6 py-2.5 font-mono text-xs text-zinc-400">
                    {f.date?.slice(0, 10)}
                  </td>
                  <td className="px-6 py-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${STRATEGY_COLORS[f.strategy] ?? "bg-zinc-100 text-zinc-600"}`}
                    >
                      {f.strategy?.replace(/-/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-2.5 text-zinc-500">{f.status}</td>
                  <td className="px-6 py-2.5 max-w-[300px] truncate text-zinc-600 dark:text-zinc-400">
                    {f.summary}
                  </td>
                </tr>
              ))}
              {findings.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-zinc-400">
                    No findings — check Market Lake API.
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
