"use client";

import type { CandidateSummary } from "./candidate-inspection-sheet";

export default function CandidateCompare({
  candidates,
  onInspect,
  onRemove,
  onClear,
}: {
  candidates: CandidateSummary[];
  onInspect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onClear: () => void;
}) {
  if (candidates.length < 2) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-amber-300 bg-card dark:border-amber-900 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Compare selected · {candidates.length}</h3>
          <p className="mt-0.5 text-[11px] text-zinc-400">Same screen, same run, aligned fields</p>
        </div>
        <button onClick={onClear} className="text-xs font-semibold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">Clear</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-[0.12em] text-zinc-400 dark:border-zinc-800">
              <th className="px-4 py-2.5">Candidate</th>
              <th className="px-4 py-2.5 text-right">Last</th>
              <th className="px-4 py-2.5 text-right">Change</th>
              <th className="px-4 py-2.5 text-right">{candidates[0]?.primaryLabel}</th>
              <th className="px-4 py-2.5">Best case</th>
              <th className="px-4 py-2.5">Main risk</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr key={candidate.symbol} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-4 py-3">
                  <button onClick={() => onInspect(candidate.symbol)} className="font-bold text-zinc-900 hover:underline dark:text-zinc-100">{candidate.symbol}</button>
                </td>
                <td className="px-4 py-3 text-right font-mono">{candidate.last == null ? "—" : `$${candidate.last.toFixed(2)}`}</td>
                <td className={`px-4 py-3 text-right font-mono ${(candidate.changePct ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {candidate.changePct == null ? "—" : `${(candidate.changePct * 100).toFixed(2)}%`}
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold">{candidate.primaryValue}</td>
                <td className="max-w-52 px-4 py-3 text-zinc-600 dark:text-zinc-300">{candidate.reasons[0] ?? "—"}</td>
                <td className="max-w-52 px-4 py-3 text-amber-700 dark:text-amber-300">{candidate.contradictions[0] ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => onRemove(candidate.symbol)} className="text-zinc-400 hover:text-red-500" aria-label={`Remove ${candidate.symbol} from comparison`}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
