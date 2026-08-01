"use client";

import { useEffect, useState, useMemo } from "react";
import type { Collection } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { ShapeMaterialization } from "@electric-circuits/client";
import { Settings } from "lucide-react";

import { client, POSITIONS_SHAPE, TRADES_SHAPE } from "../electric";
import { acquireShape, releaseShape } from "../shape-registry";

import { aggregateGreeks } from "@/lib/portfolio-analytics";
import type {
  NormalizedPosition,
  NormalizedTrade,
} from "@/lib/portfolio-analytics";

import AnalyticsIncome from "./analytics-income";
import AnalyticsRisk from "./analytics-risk";
import AnalyticsOpportunities from "./analytics-opportunities";
import { useOptionGreeks } from "./use-option-greeks";
import { PortfolioPolicyDrawer } from "./portfolio-policy-drawer";

// ── Electric shape types ──

interface ElectricPosition {
  id: string; symbol: string; name: string; qty: number;
  price: number; market_value: number; asset_class: string;
  institution: string; account_name: string; account_kind: string;
  position_kind: string;
}

interface ElectricTrade {
  trade_id: string; symbol: string; description: string;
  side: string; quantity: number; price: number; proceeds: number;
  date: string; is_option: boolean; option_type: string;
  option_strike: number; option_expiry: string; institution: string;
}

function useRows<T>(mat: ShapeMaterialization): T[] {
  const coll = mat.collection as Collection<Record<string, unknown>, string>;
  const { data } = useLiveQuery(
    (q: any) => q.from({ t: coll }).select(({ t }: any) => t),
    [coll],
  );
  return (data ?? []) as T[];
}

function normalizePosition(p: ElectricPosition): NormalizedPosition {
  return {
    symbol: p.symbol,
    quantity: p.qty ?? 0,
    avgCost: p.price,
    marketPrice: p.price,
    marketValue: p.market_value,
    unrealizedPnL: null,
    realizedPnL: null,
    assetType: p.asset_class === "crypto" ? "crypto" : "stock",
    institution: p.institution,
    accountName: p.account_name || p.institution,
  };
}

function normalizeTrade(t: ElectricTrade): NormalizedTrade {
  return {
    tradeId: t.trade_id,
    symbol: t.symbol,
    side: t.side === "SELL" ? "sell" : "buy",
    quantity: t.quantity,
    price: t.price,
    proceeds: t.proceeds ?? t.price * t.quantity * (t.side === "SELL" ? 1 : -1),
    date: t.date?.split("T")[0] ?? "",
    isOption: t.is_option ?? false,
    optionType: t.option_type?.toLowerCase?.() as "call" | "put" | null,
    optionStrike: t.option_strike,
    optionExpiry: t.option_expiry,
    institution: t.institution,
  };
}

const SUBTABS = ["Income", "Risk", "Opportunities"] as const;
type Subtab = (typeof SUBTABS)[number];

export default function AnalyticsContent() {
  const [subtab, setSubtab] = useState<Subtab>("Income");
  const [posShape, setPosShape] = useState<ShapeMaterialization | null>(null);
  const [tradeShape, setTradeShape] = useState<ShapeMaterialization | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      acquireShape("analytics-positions", () => client.shape(POSITIONS_SHAPE)),
      acquireShape("analytics-trades", () => client.shape(TRADES_SHAPE)),
    ]).then(([pos, trades]) => {
      if (!alive) return;
      setPosShape(pos);
      setTradeShape(trades);
    });
    return () => {
      alive = false;
      releaseShape("analytics-positions");
      releaseShape("analytics-trades");
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-1">
          {SUBTABS.map((t) => (
            <button
              key={t}
              onClick={() => setSubtab(t)}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                subtab === t
                  ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-b-2 border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPolicyOpen(true)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-800"
          title="Settings"
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Settings</span>
        </button>
      </div>

      {/* Content */}
      {!posShape || !tradeShape ? (
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-400">
          Connecting…
        </div>
      ) : (
        <AnalyticsViews
          subtab={subtab}
          posShape={posShape}
          tradeShape={tradeShape}
        />
      )}

      <PortfolioPolicyDrawer open={policyOpen} onOpenChange={setPolicyOpen} />
    </div>
  );
}

function AnalyticsViews({
  subtab,
  posShape,
  tradeShape,
}: {
  subtab: Subtab;
  posShape: ShapeMaterialization;
  tradeShape: ShapeMaterialization;
}) {
  const electricPositions = useRows<ElectricPosition>(posShape);
  const electricTrades = useRows<ElectricTrade>(tradeShape);

  const normTrades = useMemo(
    () => electricTrades.map(normalizeTrade),
    [electricTrades],
  );

  const { greekMap } = useOptionGreeks({ trades: normTrades });

  const { normPositions, greeks } = useMemo(() => {
    const normP = electricPositions.map(normalizePosition);
    const g = aggregateGreeks(normP, greekMap, new Date().toISOString());
    return { normPositions: normP, greeks: g };
  }, [electricPositions, greekMap]);

  return (
    <>
      {subtab === "Income" && (
        <AnalyticsIncome
          positions={normPositions}
          trades={normTrades}
          greeks={greeks}
          loading={false}
        />
      )}
      {subtab === "Risk" && (
        <AnalyticsRisk
          positions={normPositions}
          positionGreeks={greeks.positionGreeks}
          greeks={greeks}
        />
      )}
      {subtab === "Opportunities" && (
        <AnalyticsOpportunities
          positions={normPositions}
          trades={normTrades}
          greeks={greeks}
        />
      )}
    </>
  );
}
