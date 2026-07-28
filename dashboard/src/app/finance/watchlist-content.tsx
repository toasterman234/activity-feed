"use client";

import { useEffect, useRef, useState } from "react";
import OptionChainSheet from "./option-chain-sheet";
import { getLiveQuotes, searchSymbols, type LiveQuote, type SymbolSearchResult } from "../../lib/market-lake";
import { getFinanceResearch, researchThreadHref, type FinanceResearchContext } from "../../lib/finance-research";

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

export default function WatchlistContent() {
  const [quotes, setQuotes] = useState<LiveQuote[]>([]);
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<LiveQuote | null>(null);
  const [research, setResearch] = useState<FinanceResearchContext[]>([]);
  const [activeCollection, setActiveCollection] = useState("default");

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SymbolSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  useEffect(() => { void refresh(symbols); }, []);
  useEffect(() => {
    void getFinanceResearch().then((snapshot) => setResearch(snapshot.contexts)).catch(() => {});
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      void refresh(symbols);
    }, 15_000);
    return () => clearInterval(id);
  }, [symbols]);

  useEffect(() => {
    if (!selectedQuote) return;
    const freshMatch = quotes.find((quote) => quote.symbol === selectedQuote.symbol);
    if (freshMatch) setSelectedQuote(freshMatch);
  }, [quotes, selectedQuote]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchSymbols(query);
        setSuggestions(results);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const addSymbol = (sym: string) => {
    sym = sym.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) {
      const next = [...symbols, sym];
      setSymbols(next);
      void refresh(next);
    }
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
  };

  const chooseCollection = (id: string) => {
    setActiveCollection(id);
    const context = research.find((item) => item.id === id);
    const next = context?.symbols.length ? context.symbols : DEFAULT_SYMBOLS;
    setSymbols(next);
    void refresh(next);
  };

  const handleAddSymbol = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      addSymbol(suggestions[activeIndex].symbol);
    } else if (query.trim()) {
      addSymbol(query);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setActiveIndex(-1);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Collection</span>
            <button type="button" onClick={() => chooseCollection("default")} className={`rounded-full px-3 py-1 text-xs ${activeCollection === "default" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>Default</button>
            {research.filter((item) => item.kind === "theme" && item.symbols.length).map((context) => (
              <button key={context.id} type="button" onClick={() => chooseCollection(context.id)} className={`rounded-full px-3 py-1 text-xs ${activeCollection === context.id ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"}`}>
                {context.title} · {context.symbols.length}
              </button>
            ))}
          </div>
          <form ref={formRef} onSubmit={handleAddSymbol} className="flex gap-3">
            <div className="relative flex-1">
              <input
                name="symbol"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onKeyDown={handleKeyDown}
                placeholder="Add symbol (e.g. AMD)"
                autoComplete="off"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                  {suggestions.map((s, i) => (
                    <li key={s.symbol}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addSymbol(s.symbol)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                          i === activeIndex ? "bg-zinc-100 dark:bg-zinc-700" : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                        }`}
                      >
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">{s.symbol}</span>
                        <span className="text-xs text-zinc-400">{[s.asset_type, s.sector].filter(Boolean).join(" · ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">Add</button>
            <button type="button" onClick={() => { void refresh(symbols); }} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">Refresh</button>
          </form>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-zinc-500">Live Quotes {loading ? "· updating…" : ""}</h2>
              <span className="text-xs text-zinc-400">Tap a row for live options</span>
            </div>
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
                    onClick={() => setSelectedQuote(q)}
                    className="cursor-pointer border-b border-zinc-50 transition hover:bg-zinc-50/80 dark:border-zinc-800/50 dark:hover:bg-zinc-900/70"
                  >
                    <td className="px-6 py-2.5 font-medium text-zinc-800 dark:text-zinc-200">
                      <div className="flex items-center gap-2">
                        <span>{q.symbol}</span>
                        {research.filter((item) => item.symbols.includes(q.symbol)).slice(0, 1).map((context) => (
                          <a key={context.id} href={researchThreadHref(context)} onClick={(event) => event.stopPropagation()} className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300" title={`Open ${context.title} in Quant`}>
                            {context.status === "stale" ? "stale research" : "quant"}
                          </a>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono text-zinc-700 dark:text-zinc-300">{fmtN(q.last)}</td>
                    <td className={`px-6 py-2.5 text-right font-mono ${(q.change_pct ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtPct(q.change_pct)}</td>
                    <td className="px-6 py-2.5 text-right font-mono text-zinc-500">{fmtN(q.bid)}</td>
                    <td className="px-6 py-2.5 text-right font-mono text-zinc-500">{fmtN(q.ask)}</td>
                    <td className="px-6 py-2.5 text-right font-mono text-zinc-400">{q.spread_pct != null ? `${(q.spread_pct * 100).toFixed(3)}%` : "—"}</td>
                    <td className="px-6 py-2.5 text-right font-mono text-zinc-400">{q.volume?.toLocaleString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-wrap gap-2">
          {symbols.map((s) => (
            <button key={s} onClick={() => {
              const next = symbols.filter((x) => x !== s);
              setSymbols(next);
              void refresh(next);
            }} className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 hover:bg-red-100 hover:text-red-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-red-900/50 dark:hover:text-red-400" title="Remove">{s} ×</button>
          ))}
        </section>
      </div>

      <OptionChainSheet
        symbol={selectedQuote?.symbol ?? null}
        open={selectedQuote != null}
        initialPrice={selectedQuote?.last ?? null}
        onClose={() => setSelectedQuote(null)}
      />
    </>
  );
}
