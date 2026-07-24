"use client";

import { useEffect, useState } from "react";
import type { Collection } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { ShapeMaterialization } from "@electric-circuits/client";
import { client, TRADES_SHAPE } from "../electric";

interface Trade {
  trade_id: string;
  symbol: string;
  description: string;
  side: string;
  quantity: number;
  price: number;
  proceeds: number;
  date: string;
  is_option: boolean;
  option_type: string;
  option_strike: number;
  option_expiry: string;
  institution: string;
}

const PAGE_SIZE = 50;

let tradeCache: Promise<ShapeMaterialization> | null = null;
function getTradeShape(): Promise<ShapeMaterialization> {
  if (!tradeCache) tradeCache = client.shape(TRADES_SHAPE);
  return tradeCache;
}

function useRows<T>(mat: ShapeMaterialization): T[] {
  const coll = mat.collection as Collection<Record<string, unknown>, string>;
  const { data } = useLiveQuery(
    (q: any) => q.from({ t: coll }).select(({ t }: any) => t),
    [coll],
  );
  return (data ?? []) as T[];
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

export default function TradesPage() {
  const [shape, setShape] = useState<ShapeMaterialization | null>(null);

  useEffect(() => { getTradeShape().then(setShape); }, []);

  if (!shape) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-400">
        Connecting to electric-circuits…
      </div>
    );
  }

  return <TradesContent shape={shape} />;
}

function TradesContent({ shape }: { shape: ShapeMaterialization }) {
  const rows = useRows<Trade>(shape);
  const [page, setPage] = useState(0);
  const sorted = rows.slice().sort((a, b) => b.date.localeCompare(a.date));
  const pageCount = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-500">Trade History · {sorted.length} trades</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400 dark:border-zinc-800">
                <th className="px-6 py-2 font-medium">Date</th>
                <th className="px-6 py-2 font-medium">Symbol</th>
                <th className="px-6 py-2 font-medium">Description</th>
                <th className="px-6 py-2 text-right font-medium">Side</th>
                <th className="px-6 py-2 text-right font-medium">Qty</th>
                <th className="px-6 py-2 text-right font-medium">Price</th>
                <th className="px-6 py-2 text-right font-medium">Proceeds</th>
                <th className="px-6 py-2 font-medium">Institution</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((t) => (
                <tr key={t.trade_id} className="border-b border-zinc-50 dark:border-zinc-800/50">
                  <td className="px-6 py-2.5 font-mono text-xs text-zinc-500">{t.date?.slice(0, 10)}</td>
                  <td className="px-6 py-2.5 font-medium text-zinc-800 dark:text-zinc-200">
                    {t.symbol || "—"}{t.is_option && <span className="ml-1 text-xs text-amber-500">OPT</span>}
                  </td>
                  <td className="px-6 py-2.5 max-w-[200px] truncate text-zinc-500">{t.description || t.symbol}</td>
                  <td className={`px-6 py-2.5 text-right font-medium ${t.side?.toLowerCase() === "buy" ? "text-emerald-600" : t.side?.toLowerCase() === "sell" ? "text-red-500" : "text-zinc-500"}`}>{t.side || "—"}</td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-700 dark:text-zinc-300">{t.quantity?.toLocaleString()}</td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-600 dark:text-zinc-400">{fmt(t.price)}</td>
                  <td className="px-6 py-2.5 text-right font-mono font-medium text-zinc-800 dark:text-zinc-200">{fmt(t.proceeds)}</td>
                  <td className="px-6 py-2.5 text-zinc-400">{t.institution}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-zinc-400">No trades — run ingestion service to sync Life OS data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-3 dark:border-zinc-800">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="rounded-lg border border-zinc-200 px-3 py-1 text-sm text-zinc-600 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-400">Prev</button>
            <span className="text-sm text-zinc-400">{page + 1} / {pageCount}</span>
            <button onClick={() => setPage(Math.min(pageCount - 1, page + 1))} disabled={page === pageCount - 1} className="rounded-lg border border-zinc-200 px-3 py-1 text-sm text-zinc-600 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-400">Next</button>
          </div>
        )}
      </section>
    </div>
  );
}
