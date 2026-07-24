"use client";

import { useEffect, useState } from "react";
import { getLiveQuotes, type LiveQuote } from "../../lib/market-lake";

const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL", "SPY", "QQQ"];

function fmtN(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(2)}%`;
}

export default function WatchlistPage() {
  const [quotes, setQuotes] = useState<LiveQuote[]>([]);
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (syms: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const q = await getLiveQuotes(syms);
      setQuotes(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch quotes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(symbols); }, []);

  // Auto-refresh every 15s
  useEffect(() => {
    const id = setInterval(() => refresh(symbols), 15_000);
    return () => clearInterval(id);
  }, [symbols]);

  const handleAddSymbol = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("symbol") as HTMLInputElement;
    const sym = input.value.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) {
      setSymbols((prev) => [...prev, sym]);
      refresh([...symbols, sym]);
    }
    input.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Add symbol */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <form onSubmit={handleAddSymbol} className="flex gap-3">
          <input
            name="symbol"
            placeholder="Add symbol (e.g. AMD)"
            className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          />
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => refresh(symbols)}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Refresh
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </section>

      {/* Quote table */}
      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-500">
            Live Quotes {loading ? "· updating…" : ""}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400 dark:border-zinc-800">
                <th className="px-6 py-2 font-medium">Symbol</th>
                <th className="px-6 py-2 text-right font-medium">Last</th>
                <th className="px-6 py-2 text-right font-medium">Change</th>
                <th className="px-6 py-2 text-right font-medium">Bid</th>
                <th className="px-6 py-2 text-right font-medium">Ask</th>
                <th className="px-6 py-2 text-right font-medium">Spread</th>
                <th className="px-6 py-2 text-right font-medium">Volume</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr
                  key={q.symbol}
                  className="border-b border-zinc-50 dark:border-zinc-800/50"
                >
                  <td className="px-6 py-2.5 font-medium text-zinc-800 dark:text-zinc-200">
                    {q.symbol}
                  </td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-700 dark:text-zinc-300">
                    {fmtN(q.last)}
                  </td>
                  <td
                    className={`px-6 py-2.5 text-right font-mono ${
                      (q.change_pct ?? 0) >= 0
                        ? "text-emerald-600"
                        : "text-red-500"
                    }`}
                  >
                    {fmtPct(q.change_pct)}
                  </td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-500">
                    {fmtN(q.bid)}
                  </td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-500">
                    {fmtN(q.ask)}
                  </td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-400">
                    {q.spread_pct != null ? `${(q.spread_pct * 100).toFixed(3)}%` : "—"}
                  </td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-400">
                    {q.volume?.toLocaleString() ?? "—"}
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-400">
                    No quote data — check Market Lake API connection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Symbol chips */}
      <section className="flex flex-wrap gap-2">
        {symbols.map((s) => (
          <button
            key={s}
            onClick={() => {
              const next = symbols.filter((x) => x !== s);
              setSymbols(next);
              refresh(next);
            }}
            className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 hover:bg-red-100 hover:text-red-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-red-900/50 dark:hover:text-red-400"
            title="Remove"
          >
            {s} ×
          </button>
        ))}
      </section>
    </div>
  );
}
