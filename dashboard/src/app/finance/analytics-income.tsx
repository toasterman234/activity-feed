"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import {
  computeIncomeMetrics,
  computeEstimatedCapital,
  computeThetaBySymbol,
  classifyIncomeSources,
  generateIncomeForecast,
  formatCurrency,
  formatPercent,
  formatNumber,
} from "@/lib/portfolio-analytics";
import type {
  NormalizedPosition,
  NormalizedTrade,
  AggregatedGreeks,
  IncomeMetrics,
} from "@/lib/portfolio-analytics";
import { DataFreshnessBadge, freshnessFromAge } from "./data-freshness";

const CHART_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a",
  "#0891b2", "#ca8a04", "#4f46e5", "#be123c", "#15803d",
];

function MetricCardView({
  title, value, subtitle, status, description,
}: {
  title: string; value: string; subtitle?: string;
  status?: string; description?: string;
}) {
  const statusColors: Record<string, string> = {
    positive: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    critical: "text-red-600 dark:text-red-400",
    neutral: "text-zinc-500",
    watch: "text-amber-500",
    unavailable: "text-zinc-400",
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{title}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${statusColors[status ?? "neutral"]}`}>
        {value}
      </p>
      {subtitle && <p className="mt-0.5 text-[10px] text-zinc-400">{subtitle}</p>}
      {description && (
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">{description}</p>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 animate-pulse">
      <div className="h-3 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-1.5 h-6 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
    </div>
  );
}

export default function AnalyticsIncome({
  positions, trades, greeks, loading,
}: {
  positions: NormalizedPosition[];
  trades: NormalizedTrade[];
  greeks: AggregatedGreeks;
  loading: boolean;
}) {
  const capital = useMemo(() => computeEstimatedCapital(positions), [positions]);

  const m = useMemo<IncomeMetrics | null>(() => {
    if (loading || positions.length === 0) return null;
    return computeIncomeMetrics(greeks, positions, trades, capital);
  }, [greeks, positions, trades, capital, loading]);

  const thetaBySymbol = useMemo(
    () => m ? computeThetaBySymbol(greeks.positionGreeks) : [],
    [greeks.positionGreeks, m],
  );

  const incomeSources = useMemo(
    () => m ? classifyIncomeSources(trades, positions) : [],
    [trades, positions, m],
  );

  const forecast = useMemo(
    () => m ? generateIncomeForecast(
      greeks.netTheta,
      greeks.positionGreeks
        .filter((g) => g.expiration)
        .map((g) => ({ symbol: g.symbol, expiry: g.expiration!, theta: g.theta })),
    ) : [],
    [greeks, m],
  );

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (!m) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-400">
        No position data available
      </div>
    );
  }

  const freshness = freshnessFromAge(greeks.timestamp ? Date.now() - new Date(greeks.timestamp).getTime() : null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <DataFreshnessBadge info={freshness} asOf={greeks.timestamp} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCardView
          title="Net Daily Theta"
          value={formatCurrency(m.netDailyTheta)}
          subtitle="modeled time decay / day"
          status={m.netDailyTheta > 0 ? "positive" : "warning"}
          description="Signed portfolio theta × contract multiplier. Modeled, not guaranteed."
        />
        <MetricCardView
          title="Realized P&L (Today)"
          value={formatCurrency(m.realizedPnL.today)}
          subtitle={`MTD: ${formatCurrency(m.realizedPnL.mtd)}`}
          status={m.realizedPnL.today >= 0 ? "positive" : "warning"}
        />
        <MetricCardView
          title="Net Premium Flow"
          value={formatCurrency(m.netPremiumCashFlow.netFlow)}
          subtitle={`Credits: ${formatCurrency(m.netPremiumCashFlow.creditsReceived)}`}
          status={m.netPremiumCashFlow.netFlow >= 0 ? "positive" : "neutral"}
          description="Credits received minus debits and closing costs. Does not equal profit."
        />
        <MetricCardView
          title="Return on Capital"
          value={m.returnOnCapital.realizedRoc != null ? formatPercent(m.returnOnCapital.realizedRoc) : "—"}
          subtitle={`Capital: ${formatCurrency(m.returnOnCapital.allocatedCapital)}`}
          status={m.returnOnCapital.realizedRoc != null && m.returnOnCapital.realizedRoc > 0 ? "positive" : "neutral"}
        />
        <MetricCardView
          title="Unrealized Option P&L"
          value={formatCurrency(m.unrealizedOptionPnL)}
          status={m.unrealizedOptionPnL >= 0 ? "positive" : "warning"}
        />
        <MetricCardView
          title="Theta Efficiency"
          value={m.thetaEfficiency.bpsPerDay != null 
            ? `${m.thetaEfficiency.bpsPerDay.toFixed(1)} bps/day`
            : `${formatCurrency(m.thetaEfficiency.dollarsPerDay)}/day`}
          subtitle={`per ${formatCurrency(m.thetaEfficiency.allocatedCapital)} capital`}
          status="neutral"
        />
        <MetricCardView
          title="Income Concentration"
          value={`Top 1: ${formatPercent(m.incomeConcentration.top1Pct)}`}
          subtitle={`Top 3: ${formatPercent(m.incomeConcentration.top3Pct)} · Top 5: ${formatPercent(m.incomeConcentration.top5Pct)}`}
          status={m.incomeConcentration.top1Pct > 0.50 ? "warning" : "neutral"}
        />
        <MetricCardView
          title="Income Stability"
          value={m.incomeStability 
            ? `${(m.incomeStability.weekly.positivePct * 100).toFixed(0)}% weeks positive`
            : "No data"}
          subtitle={m.incomeStability 
            ? `${m.incomeStability.weekly.periodCount} weeks` 
            : undefined}
          status={m.incomeStability && m.incomeStability.weekly.positivePct > 0.75 ? "positive" : "neutral"}
        />
      </div>

      {/* Monthly income forecast */}
      {forecast.length > 0 && (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-xs font-medium text-zinc-500">
            Monthly Income Forecast <span className="text-zinc-400 font-normal">— modeled estimates</span>
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {forecast.map((f) => (
              <div key={f.scenario} className="rounded-md border border-zinc-100 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-800/50">
                <p className="text-[10px] font-medium text-zinc-500">{f.label}</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-800 dark:text-zinc-200">
                  {formatCurrency(f.estimatedMonthlyIncome)}
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-400">
                  {f.confidence} confidence · {f.assumptions.length} assumptions
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Charts: Theta by ticker + Income by source */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {thetaBySymbol.length > 0 && (
          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-3 text-xs font-medium text-zinc-500">Theta by Ticker</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={thetaBySymbol}
                  dataKey="thetaPerDay"
                  nameKey="symbol"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={2}
                  label={({ symbol, pct }) => `${symbol} ${(pct * 100).toFixed(0)}%`}
                  labelLine={{ stroke: "#a1a1aa", strokeWidth: 0.5 }}
                >
                  {thetaBySymbol.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(val: number) => formatCurrency(val)}
                />
              </PieChart>
            </ResponsiveContainer>
          </section>
        )}

        {incomeSources.length > 0 && (
          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-3 text-xs font-medium text-zinc-500">Income by Source</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={incomeSources}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#a1a1aa" />
                <YAxis tick={{ fontSize: 10 }} stroke="#a1a1aa" tickFormatter={(v: number) => formatCurrency(v)} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(val: number) => formatCurrency(val)} />
                <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                  {incomeSources.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>
        )}
      </div>

      {/* Drill-down table */}
      {thetaBySymbol.length > 0 && (
        <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400 dark:border-zinc-800">
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Strategy</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Expiry</th>
                <th className="px-3 py-2 text-right font-medium">DTE</th>
                <th className="px-3 py-2 text-right font-medium">Theta/Day</th>
                <th className="px-3 py-2 text-right font-medium">% Total</th>
              </tr>
            </thead>
            <tbody>
              {thetaBySymbol.map((row) => (
                <tr key={row.symbol} className="border-b border-zinc-50 dark:border-zinc-800/50">
                  <td className="px-3 py-1.5 font-medium text-zinc-800 dark:text-zinc-200">{row.symbol}</td>
                  <td className="px-3 py-1.5 text-zinc-500">{row.strategy}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400">1</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    {row.expiration ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    {row.expiration 
                      ? Math.ceil((new Date(row.expiration).getTime() - Date.now()) / 86400000)
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                    {formatCurrency(row.thetaPerDay)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    {formatPercent(row.pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
