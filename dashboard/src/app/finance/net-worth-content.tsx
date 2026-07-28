"use client";

import { useEffect, useState } from "react";
import type { Collection } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { ShapeMaterialization } from "@electric-circuits/client";
import { client, NET_WORTH_SHAPE, ALLOCATION_SHAPE } from "../electric";
import { acquireShape, releaseShape } from "../shape-registry";

interface NetWorth {
  date: string; net_worth: number; total_assets: number;
  total_liabilities: number; cash: number; invested: number;
}

interface Allocation {
  asset_class: string; market_value: number; target_pct: number;
  current_pct: number; drift_pct: number;
}

const ASSET_COLORS: Record<string, string> = {
  equity: "bg-blue-500", crypto: "bg-orange-500",
  bond: "bg-emerald-500", cash: "bg-zinc-400", real_estate: "bg-purple-500",
};

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
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export default function NetWorthContent() {
  const [nwShape, setNwShape] = useState<ShapeMaterialization | null>(null);
  const [allocShape, setAllocShape] = useState<ShapeMaterialization | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [nw, alloc] = await Promise.all([
        acquireShape("net-worth", () => client.shape(NET_WORTH_SHAPE)),
        acquireShape("allocation", () => client.shape(ALLOCATION_SHAPE)),
      ]);
      if (!alive) return;
      setNwShape(nw);
      setAllocShape(alloc);
    })();
    return () => {
      alive = false;
      releaseShape("net-worth");
      releaseShape("allocation");
    };
  }, []);

  if (!nwShape || !allocShape) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-400">Connecting…</div>;
  }

  return <NetWorthView nwShape={nwShape} allocShape={allocShape} />;
}

function NetWorthView({ nwShape, allocShape }: { nwShape: ShapeMaterialization; allocShape: ShapeMaterialization }) {
  const netWorthRows = useRows<NetWorth>(nwShape);
  const allocations = useRows<Allocation>(allocShape);
  const sorted = netWorthRows.slice().sort((a, b) => b.date.localeCompare(a.date));
  const latestNW = sorted[0];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-medium text-zinc-500">Net Worth{latestNW?.date ? ` · ${latestNW.date.slice(0, 10)}` : ""}</h2>
        <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{fmt(latestNW?.net_worth)}</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <div><span className="text-zinc-400">Assets</span>{" "}<span className="font-medium text-zinc-700 dark:text-zinc-300">{fmt(latestNW?.total_assets)}</span></div>
          <div><span className="text-zinc-400">Liabilities</span>{" "}<span className="font-medium text-zinc-700 dark:text-zinc-300">{fmt(latestNW?.total_liabilities)}</span></div>
          <div><span className="text-zinc-400">Cash</span>{" "}<span className="font-medium text-zinc-700 dark:text-zinc-300">{fmt(latestNW?.cash)}</span></div>
          <div><span className="text-zinc-400">Invested</span>{" "}<span className="font-medium text-zinc-700 dark:text-zinc-300">{fmt(latestNW?.invested)}</span></div>
        </div>
      </section>

      {allocations.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-medium text-zinc-500">Allocation</h2>
          <div className="flex h-5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            {allocations.map((a) => (
              <div key={a.asset_class} className={`${ASSET_COLORS[a.asset_class] ?? "bg-zinc-300"}`} style={{ width: `${Math.max(a.current_pct ?? 0, 1)}%` }} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            {allocations.map((a) => (
              <div key={a.asset_class} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${ASSET_COLORS[a.asset_class] ?? "bg-zinc-300"}`} />
                <span className="capitalize text-zinc-600 dark:text-zinc-400">{a.asset_class === "real_estate" ? "Real Estate" : a.asset_class}</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{fmtPct(a.current_pct)}%</span>
                {a.drift_pct != null && Math.abs(a.drift_pct) > 2 && (
                  <span className={`text-xs ${a.drift_pct > 0 ? "text-amber-600" : "text-emerald-600"}`}>{a.drift_pct > 0 ? "+" : ""}{a.drift_pct.toFixed(1)}%</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {sorted.length > 1 && (
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-500">History</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400 dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 text-right font-medium">Net Worth</th>
                <th className="px-4 py-2 text-right font-medium">Assets</th>
                <th className="px-4 py-2 text-right font-medium">Liabilities</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((nw) => (
                <tr key={nw.date} className="border-b border-zinc-50 dark:border-zinc-800/50">
                  <td className="px-4 py-2 font-mono text-xs text-zinc-500">{nw.date?.slice(0, 10)}</td>
                  <td className="px-4 py-2 text-right font-mono font-medium text-zinc-800 dark:text-zinc-200">{fmt(nw.net_worth)}</td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-600 dark:text-zinc-400">{fmt(nw.total_assets)}</td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-600 dark:text-zinc-400">{fmt(nw.total_liabilities)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
