"use client";

import { useEffect, useState } from "react";
import type { Collection } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { ShapeMaterialization } from "@electric-circuits/client";
import { client, POSITIONS_SHAPE, NET_WORTH_SHAPE, ALLOCATION_SHAPE } from "../electric";
import { acquireShape, releaseShape } from "../shape-registry";

interface Position {
  id: string;
  symbol: string;
  name: string;
  qty: number;
  price: number;
  market_value: number;
  asset_class: string;
  institution: string;
  account_name: string;
  account_kind: string;
  position_kind: string;
}

interface NetWorth {
  date: string;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
  cash: number;
  invested: number;
}

interface Allocation {
  asset_class: string;
  market_value: number;
  target_pct: number;
  current_pct: number;
  drift_pct: number;
}

const ASSET_COLORS: Record<string, string> = {
  equity: "bg-blue-500",
  crypto: "bg-orange-500",
  bond: "bg-emerald-500",
  cash: "bg-zinc-400",
  real_estate: "bg-purple-500",
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

export default function PortfolioPage() {
  const [nwShape, setNwShape] = useState<ShapeMaterialization | null>(null);
  const [allocShape, setAllocShape] = useState<ShapeMaterialization | null>(null);
  const [posShape, setPosShape] = useState<ShapeMaterialization | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      acquireShape("legacy-net-worth", () => client.shape(NET_WORTH_SHAPE)),
      acquireShape("legacy-allocation", () => client.shape(ALLOCATION_SHAPE)),
      acquireShape("legacy-positions", () => client.shape(POSITIONS_SHAPE)),
    ]).then(([netWorth, allocation, positions]) => {
      if (!alive) return;
      setNwShape(netWorth);
      setAllocShape(allocation);
      setPosShape(positions);
    });
    return () => {
      alive = false;
      releaseShape("legacy-net-worth");
      releaseShape("legacy-allocation");
      releaseShape("legacy-positions");
    };
  }, []);

  if (!nwShape || !allocShape || !posShape) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-400">
        Connecting to electric-circuits…
      </div>
    );
  }

  return <PortfolioContent nwShape={nwShape} allocShape={allocShape} posShape={posShape} />;
}

function PortfolioContent({ nwShape, allocShape, posShape }: {
  nwShape: ShapeMaterialization;
  allocShape: ShapeMaterialization;
  posShape: ShapeMaterialization;
}) {
  const netWorthRows = useRows<NetWorth>(nwShape);
  const allocations = useRows<Allocation>(allocShape);
  const positions = useRows<Position>(posShape);

  const latestNW = netWorthRows.sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <div className="space-y-6">
      {/* Net Worth Card */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-medium text-zinc-500">Net Worth</h2>
        <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          {fmt(latestNW?.net_worth)}
        </p>
        <div className="mt-3 flex gap-6 text-sm">
          <div><span className="text-zinc-400">Assets</span>{" "}<span className="font-medium text-zinc-700 dark:text-zinc-300">{fmt(latestNW?.total_assets)}</span></div>
          <div><span className="text-zinc-400">Liabilities</span>{" "}<span className="font-medium text-zinc-700 dark:text-zinc-300">{fmt(latestNW?.total_liabilities)}</span></div>
          <div><span className="text-zinc-400">Cash</span>{" "}<span className="font-medium text-zinc-700 dark:text-zinc-300">{fmt(latestNW?.cash)}</span></div>
          <div><span className="text-zinc-400">Invested</span>{" "}<span className="font-medium text-zinc-700 dark:text-zinc-300">{fmt(latestNW?.invested)}</span></div>
        </div>
      </section>

      {/* Allocation Bar */}
      {allocations.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-medium text-zinc-500">Allocation</h2>
          <div className="flex h-5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            {allocations.map((a) => (
              <div
                key={a.asset_class}
                className={`${ASSET_COLORS[a.asset_class] ?? "bg-zinc-300"} transition-all`}
                style={{ width: `${Math.max(a.current_pct ?? 0, 1)}%` }}
                title={`${a.asset_class}: ${fmtPct(a.current_pct)}`}
              />
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

      {/* Positions */}
      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-500">Positions · {positions.filter(p => p.position_kind !== "Cash sweep").length} holdings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400 dark:border-zinc-800">
                <th className="px-6 py-2 font-medium">Symbol</th>
                <th className="px-6 py-2 font-medium">Name</th>
                <th className="px-6 py-2 text-right font-medium">Price</th>
                <th className="px-6 py-2 text-right font-medium">Qty</th>
                <th className="px-6 py-2 text-right font-medium">Value</th>
                <th className="px-6 py-2 font-medium">Account</th>
              </tr>
            </thead>
            <tbody>
              {positions.filter(p => p.position_kind !== "Cash sweep").sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0)).map((p) => (
                <tr key={p.id} className="border-b border-zinc-50 dark:border-zinc-800/50">
                  <td className="px-6 py-2.5 font-medium text-zinc-800 dark:text-zinc-200">{p.symbol || "—"}</td>
                  <td className="px-6 py-2.5 text-zinc-500">{p.name}</td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-700 dark:text-zinc-300">{p.price != null ? `$${p.price.toFixed(2)}` : "—"}</td>
                  <td className="px-6 py-2.5 text-right font-mono text-zinc-700 dark:text-zinc-300">{p.qty?.toLocaleString() ?? "—"}</td>
                  <td className="px-6 py-2.5 text-right font-mono font-medium text-zinc-800 dark:text-zinc-200">{fmt(p.market_value)}</td>
                  <td className="px-6 py-2.5 text-zinc-400">{p.account_name || p.institution}</td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-zinc-400">No positions — run ingestion service to sync Life OS data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
