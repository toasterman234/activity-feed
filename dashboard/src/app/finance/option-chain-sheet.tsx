"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getLiveQuotes,
  getOptionChain,
  getOptionExpirations,
  type LiveQuote,
  type OptionChainResponse,
  type OptionRow,
} from "../../lib/market-lake";

type OptionSide = "call" | "put";
type SortKey = "strike" | "last" | "bid" | "ask" | "mid" | "volume" | "open_interest" | "implied_volatility" | "delta";
type SortDir = "asc" | "desc";
type Moneyness = "all" | "itm" | "otm";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "strike", label: "Strike" },
  { value: "volume", label: "Volume" },
  { value: "open_interest", label: "Open interest" },
  { value: "implied_volatility", label: "IV" },
  { value: "delta", label: "Delta" },
  { value: "mid", label: "Mid" },
  { value: "bid", label: "Bid" },
  { value: "ask", label: "Ask" },
  { value: "last", label: "Last" },
];

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n >= 10 ? 2 : 3,
    maximumFractionDigits: n >= 10 ? 2 : 3,
  }).format(n);
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return n.toFixed(digits);
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function readSortValue(row: OptionRow, key: SortKey): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isInTheMoney(row: OptionRow, spotPrice: number | null): boolean | null {
  if (spotPrice == null || row.strike == null) return null;
  return row.side === "call" ? row.strike <= spotPrice : row.strike >= spotPrice;
}

export default function OptionChainSheet({
  symbol,
  open,
  onClose,
  initialPrice,
}: {
  symbol: string | null;
  open: boolean;
  onClose: () => void;
  initialPrice?: number | null;
}) {
  const [expirations, setExpirations] = useState<string[]>([]);
  const [selectedExpiration, setSelectedExpiration] = useState<string>("");
  const [chain, setChain] = useState<OptionChainResponse | null>(null);
  const [spotPrice, setSpotPrice] = useState<number | null>(initialPrice ?? null);
  const [side, setSide] = useState<OptionSide>("call");
  const [sortKey, setSortKey] = useState<SortKey>("strike");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [moneyness, setMoneyness] = useState<Moneyness>("all");
  const [hideZeroBid, setHideZeroBid] = useState(true);
  const [minVolume, setMinVolume] = useState(1);
  const [minOpenInterest, setMinOpenInterest] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !symbol) return;
    setError(null);
    setSpotPrice(initialPrice ?? null);
    setChain(null);
    setExpirations([]);
    setSelectedExpiration("");
    setSide("call");
    setSortKey("strike");
    setSortDir("asc");
    setMoneyness("all");
    setHideZeroBid(true);
    setMinVolume(1);
    setMinOpenInterest(1);
  }, [open, symbol, initialPrice]);

  useEffect(() => {
    if (!open || !symbol) return;
    let cancelled = false;

    const loadMeta = async () => {
      try {
        const [dates, quotes] = await Promise.all([
          getOptionExpirations(symbol),
          getLiveQuotes([symbol]),
        ]);
        if (cancelled) return;
        setExpirations(dates);
        setSelectedExpiration((prev) => prev || dates[0] || "");
        const liveQuote: LiveQuote | undefined = quotes[0];
        setSpotPrice(initialPrice ?? liveQuote?.last ?? null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load option metadata");
      }
    };

    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, [open, symbol, initialPrice]);

  useEffect(() => {
    if (!open || !symbol || !selectedExpiration) return;
    let cancelled = false;

    const loadChain = async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await getOptionChain(symbol, selectedExpiration);
        if (!cancelled) setChain(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load option chain");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadChain();
    const timer = window.setInterval(() => {
      void loadChain();
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, symbol, selectedExpiration]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const rows = useMemo(() => {
    const allRows = side === "call" ? chain?.calls ?? [] : chain?.puts ?? [];
    const filtered = allRows.filter((row) => {
      if (hideZeroBid && (row.bid ?? 0) <= 0) return false;
      if ((row.volume ?? 0) < minVolume) return false;
      if ((row.open_interest ?? 0) < minOpenInterest) return false;
      if (moneyness !== "all") {
        const itm = isInTheMoney(row, spotPrice);
        if (itm == null) return true;
        if (moneyness === "itm" && !itm) return false;
        if (moneyness === "otm" && itm) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const left = readSortValue(a, sortKey);
      const right = readSortValue(b, sortKey);
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      return sortDir === "asc" ? left - right : right - left;
    });

    return filtered;
  }, [chain, side, hideZeroBid, minVolume, minOpenInterest, moneyness, spotPrice, sortKey, sortDir]);

  if (!open || !symbol) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="relative h-full w-full max-w-4xl overflow-y-auto border-l border-zinc-200 bg-card shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="sticky top-0 z-10 border-b border-zinc-200 bg-card/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Live option chain</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{symbol}</h2>
                <span className="text-sm text-zinc-500">Spot {fmtMoney(spotPrice)}</span>
                <span className="text-sm text-zinc-500">Expiry {chain?.expiration || selectedExpiration || "—"}</span>
                <span className="text-sm text-zinc-500">{loading ? "Refreshing…" : `${rows.length} contracts`}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {expirations.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">Expirations</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {expirations.map((expiration) => (
                  <button
                    key={expiration}
                    onClick={() => setSelectedExpiration(expiration)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${selectedExpiration === expiration
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {expiration}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">Side</p>
                <div className="flex gap-2">
                  {(["call", "put"] as const).map((value) => (
                    <button
                      key={value}
                      onClick={() => setSide(value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${side === value
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {value === "call" ? `Calls ${chain?.calls.length ?? 0}` : `Puts ${chain?.puts.length ?? 0}`}
                    </button>
                  ))}
                </div>
              </div>

              <label>
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">Sort by</span>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">Direction</span>
                <select
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value as SortDir)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </label>

              <label>
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">Moneyness</span>
                <select
                  value={moneyness}
                  onChange={(e) => setMoneyness(e.target.value as Moneyness)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  disabled={spotPrice == null}
                >
                  <option value="all">All contracts</option>
                  <option value="itm">In the money</option>
                  <option value="otm">Out of the money</option>
                </select>
              </label>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label>
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">Min volume</span>
                <input
                  type="number"
                  min={0}
                  value={minVolume}
                  onChange={(e) => setMinVolume(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                />
              </label>
              <label>
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">Min open interest</span>
                <input
                  type="number"
                  min={0}
                  value={minOpenInterest}
                  onChange={(e) => setMinOpenInterest(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                />
              </label>
              <label className="flex items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800">
                <input
                  type="checkbox"
                  checked={hideZeroBid}
                  onChange={(e) => setHideZeroBid(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">Hide zero-bid contracts</span>
              </label>
            </div>
          </section>

          {error && (
            <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-card dark:border-zinc-800 dark:bg-zinc-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-zinc-400 dark:border-zinc-800">
                    <th className="sticky left-0 bg-card px-4 py-2 font-medium dark:bg-zinc-900">Strike</th>
                    <th className="px-4 py-2 text-right font-medium">Last</th>
                    <th className="px-4 py-2 text-right font-medium">Bid</th>
                    <th className="px-4 py-2 text-right font-medium">Ask</th>
                    <th className="px-4 py-2 text-right font-medium">Mid</th>
                    <th className="px-4 py-2 text-right font-medium">IV</th>
                    <th className="px-4 py-2 text-right font-medium">Delta</th>
                    <th className="px-4 py-2 text-right font-medium">Volume</th>
                    <th className="px-4 py-2 text-right font-medium">OI</th>
                    <th className="px-4 py-2 text-right font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const itm = isInTheMoney(row, spotPrice);
                    return (
                      <tr key={`${row.side}-${row.strike}`} className="border-b border-zinc-50 dark:border-zinc-800/60">
                        <td className="sticky left-0 bg-card px-4 py-2.5 font-mono text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                          <div className="flex items-center gap-2">
                            <span>{fmtNum(row.strike, 2)}</span>
                            {itm != null && (
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${itm ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                                {itm ? "ITM" : "OTM"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-zinc-600 dark:text-zinc-300">{fmtMoney(row.last)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-zinc-600 dark:text-zinc-300">{fmtMoney(row.bid)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-zinc-600 dark:text-zinc-300">{fmtMoney(row.ask)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-zinc-600 dark:text-zinc-300">{fmtMoney(row.mid)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-zinc-600 dark:text-zinc-300">{fmtPct(row.implied_volatility)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${(row.delta ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtNum(row.delta, 3)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-zinc-500">{row.volume?.toLocaleString() ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-zinc-500">{row.open_interest?.toLocaleString() ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-zinc-400">{row.timestamp ? new Date(row.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && !loading && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-sm text-zinc-400">No contracts match the current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
