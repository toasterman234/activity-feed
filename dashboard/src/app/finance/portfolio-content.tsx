"use client";

import { useEffect, useState, useMemo } from "react";
import type { Collection } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { ShapeMaterialization } from "@electric-circuits/client";
import { client, POSITIONS_SHAPE, BALANCES_SHAPE } from "../electric";
import { acquireShape, releaseShape } from "../shape-registry";
import TradesContent from "./trades-content";

interface Position {
  id: string; symbol: string; name: string; qty: number; price: number;
  market_value: number; asset_class: string; institution: string;
  account_name: string; account_kind: string; position_kind: string;
}

interface Balance {
  account_id: string; balance: number; institution: string; type: string;
}

const INSTITUTION_COLORS: Record<string, string> = {
  schwab: "border-l-blue-500",
  fidelity: "border-l-green-500",
  ethereum: "border-l-orange-500",
  base: "border-l-orange-400",
  polygon: "border-l-purple-400",
  optimism: "border-l-red-400",
  arbitrum: "border-l-cyan-400",
};

function isValidPosId(id: string): boolean {
  return id.split(':').length >= 4;
}

function useRows<T>(mat: ShapeMaterialization): T[] {
  const coll = mat.collection as Collection<Record<string, unknown>, string>;
  const { data } = useLiveQuery(
    (q: any) => q.from({ t: coll }).select(({ t }: any) => t),
    [coll],
  );
  const rows = (data ?? []) as T[];
  return rows.filter((r: any) => {
    if (r.id && typeof r.id === 'string') return isValidPosId(r.id);
    return true;
  });
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function fmtCompact(n: number): string {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + n.toFixed(0);
}

// Group ETH on-chain positions into a single "ETH" account
function groupAccounts(positions: Position[]): { key: string; label: string; total: number; positions: Position[]; institutions: Set<string> }[] {
  const groups: Record<string, { label: string; total: number; positions: Position[]; institutions: Set<string> }> = {};

  for (const p of positions) {
    const mk = (p.market_value ?? 0);
    if (p.institution === "schwab") {
      const k = "schwab";
      if (!groups[k]) groups[k] = { label: "Schwab", total: 0, positions: [], institutions: new Set() };
      groups[k].total += mk;
      groups[k].positions.push(p);
      groups[k].institutions.add(p.institution);
    } else if (p.institution === "fidelity") {
      const k = "fidelity";
      if (!groups[k]) groups[k] = { label: "Fidelity", total: 0, positions: [], institutions: new Set() };
      groups[k].total += mk;
      groups[k].positions.push(p);
      groups[k].institutions.add(p.institution);
    } else if (["ethereum", "base", "polygon", "optimism", "arbitrum"].includes(p.institution ?? "")) {
      const k = "eth";
      if (!groups[k]) groups[k] = { label: "ETH", total: 0, positions: [], institutions: new Set() };
      groups[k].total += mk;
      groups[k].positions.push(p);
      groups[k].institutions.add(p.institution);
    }
  }

  return Object.entries(groups)
    .map(([key, g]) => ({ key, label: g.label, total: g.total, positions: g.positions, institutions: g.institutions }))
    .sort((a, b) => b.total - a.total);
}

const SUBTABS = ["Holdings", "Trades"] as const;
type Subtab = (typeof SUBTABS)[number];

export default function PortfolioContent() {
  const [posShape, setPosShape] = useState<ShapeMaterialization | null>(null);
  const [balShape, setBalShape] = useState<ShapeMaterialization | null>(null);
  const [subtab, setSubtab] = useState<Subtab>("Holdings");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [pos, bal] = await Promise.all([
        acquireShape("positions", () => client.shape(POSITIONS_SHAPE)),
        acquireShape("balances", () => client.shape(BALANCES_SHAPE)),
      ]);
      if (!alive) return;
      setPosShape(pos);
      setBalShape(bal);
    })();
    return () => {
      alive = false;
      releaseShape("positions");
      releaseShape("balances");
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 border-b border-zinc-100 dark:border-zinc-800">
        {SUBTABS.map((t) => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className={`px-2.5 py-1 text-xs font-medium ${
              subtab === t
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-b-2 border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {subtab === "Trades" ? (
        <TradesContent />
      ) : !posShape || !balShape ? (
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-400">Connecting…</div>
      ) : (
        <PortfolioView posShape={posShape} balShape={balShape} />
      )}
    </div>
  );
}

function PortfolioView({ posShape, balShape }: { posShape: ShapeMaterialization; balShape: ShapeMaterialization }) {
  const positions = useRows<Position>(posShape);
  const balances = useRows<Balance>(balShape);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"value" | "name" | "symbol">("value");

  const accounts = useMemo(() => groupAccounts(positions), [positions]);
  const totalVal = accounts.reduce((s, a) => s + a.total, 0);

  // cash by institution
  const cashByInst: Record<string, number> = {};
  for (const b of balances) {
    const n = Number(b.balance) || 0;
    cashByInst[b.institution] = (cashByInst[b.institution] || 0) + n;
  }

  const acctBalances: Record<string, number> = {};
  for (const a of accounts) {
    let cash = 0;
    for (const inst of a.institutions) cash += cashByInst[inst] || 0;
    acctBalances[a.key] = cash;
  }

  // filter positions within expanded account
  const q = search.toLowerCase();
  const filterPos = (ps: Position[]) => {
    if (!q) return ps;
    return ps.filter(p =>
      (p.symbol ?? "").toLowerCase().includes(q) ||
      (p.name ?? "").toLowerCase().includes(q) ||
      (p.account_name ?? "").toLowerCase().includes(q) ||
      (p.institution ?? "").toLowerCase().includes(q)
    );
  };

  const sortPos = (ps: Position[]) => {
    if (sort === "name") return [...ps].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    if (sort === "symbol") return [...ps].sort((a, b) => (a.symbol ?? "").localeCompare(b.symbol ?? ""));
    return [...ps].sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));
  };

  return (
    <div className="space-y-3">
      {/* header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-500">Portfolio · {fmtCompact(totalVal)}</h2>
        <div className="flex items-center gap-2">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter…" className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-800 placeholder:text-zinc-400 w-28 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" />
          <select value={sort} onChange={e => setSort(e.target.value as any)} className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
            <option value="value">By value</option>
            <option value="name">By name</option>
            <option value="symbol">By symbol</option>
          </select>
        </div>
      </div>

      {/* Account cards */}
      <div className="space-y-2">
        {accounts.map(a => {
          const expanded = expandedAccount === a.key;
          const filtered = filterPos(a.positions);
          const sorted = sortPos(filtered);
          const cashLabel = acctBalances[a.key] > 0 ? `+ ${fmt(acctBalances[a.key])} cash` : "";

          return (
            <div key={a.key} className={`rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${expanded ? "ring-1 ring-zinc-300 dark:ring-zinc-700" : ""}`}>
              <button onClick={() => setExpandedAccount(expanded ? null : a.key)} className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{a.label}</p>
                  <p className="text-[10px] text-zinc-400">{a.positions.length} position{a.positions.length !== 1 ? "s" : ""}{cashLabel ? ` · ${cashLabel}` : ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{fmt(a.total)}</p>
                  <p className="text-[10px] text-zinc-400">{((a.total / totalVal) * 100).toFixed(0)}%</p>
                </div>
              </button>

              {expanded && (
                <div className="border-t border-zinc-100 dark:border-zinc-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 text-left text-zinc-400 dark:border-zinc-800">
                        <th className="px-3 py-1.5 text-[10px] font-medium">Symbol</th>
                        <th className="px-3 py-1.5 text-[10px] font-medium">Name</th>
                        <th className="px-3 py-1.5 text-[10px] text-right font-medium">Price</th>
                        <th className="px-3 py-1.5 text-[10px] text-right font-medium">Qty</th>
                        <th className="px-3 py-1.5 text-[10px] text-right font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(p => (
                        <tr key={p.id} className="border-b border-zinc-50 dark:border-zinc-800/50">
                          <td className="px-3 py-1.5 font-medium text-zinc-800 dark:text-zinc-200">{p.symbol || "—"}</td>
                          <td className="px-3 py-1.5 text-xs text-zinc-500 max-w-[120px] truncate">{p.name}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs text-zinc-600 dark:text-zinc-400">{p.price != null ? `$${Number(p.price).toFixed(2)}` : "—"}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs text-zinc-600 dark:text-zinc-400">{Number(p.qty || 0).toLocaleString(undefined, { maximumSignificantDigits: 6 })}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">{fmt(p.market_value)}</td>
                        </tr>
                      ))}
                      {acctBalances[a.key] > 0 && (
                        <tr className="border-b border-zinc-50 dark:border-zinc-800/50">
                          <td className="px-3 py-1.5 text-zinc-400">—</td>
                          <td className="px-3 py-1.5 text-xs text-zinc-400">Cash</td>
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5 text-right font-mono text-xs text-zinc-500">{fmt(acctBalances[a.key])}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
