"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Treemap,
} from "recharts";

import {
  computeConcentrationBreakdown,
  computeExpirationRisk,
  computeAssignmentRisks,
  computeBuyingPower,
  computeCompositeRiskStatus,
  identifyCorrelationGroups,
  classifyRiskDefinitions,
  computeGrossNotional,
  runStressTest,
  worstScenario,
  formatCurrency,
  formatPercent,
} from "@/lib/portfolio-analytics";
import type {
  NormalizedPosition,
  AggregatedGreeks,
  StressTestGrid,
} from "@/lib/portfolio-analytics";
import { DataFreshnessBadge, freshnessFromAge } from "./data-freshness";

const CHART_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a",
  "#0891b2", "#ca8a04", "#4f46e5", "#be123c", "#15803d",
];

const RISK_COLORS = {
  ok: "text-emerald-600 dark:text-emerald-400",
  watch: "text-amber-500 dark:text-amber-400",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
};

// ── Sub-components ──

function MetricCardView({
  title, value, subtitle, status, description,
}: {
  title: string; value: string; subtitle?: string;
  status?: string; description?: string;
}) {
  const statusClasses: Record<string, string> = {
    ok: "text-emerald-600 dark:text-emerald-400",
    positive: "text-emerald-600 dark:text-emerald-400",
    watch: "text-amber-500 dark:text-amber-400",
    warning: "text-amber-600 dark:text-amber-400",
    critical: "text-red-600 dark:text-red-400",
    neutral: "text-zinc-500",
    unavailable: "text-zinc-400",
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{title}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${statusClasses[status ?? "neutral"]}`}>
        {value}
      </p>
      {subtitle && <p className="mt-0.5 text-[10px] text-zinc-400">{subtitle}</p>}
      {description && (
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">{description}</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    watch: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[status] ?? "bg-zinc-100 text-zinc-500"}`}>
      {status}
    </span>
  );
}

// ── Props ──

interface Props {
  positions: NormalizedPosition[];
  positionGreeks: AggregatedGreeks["positionGreeks"];
  greeks: AggregatedGreeks;
}

// ── Main component ──

export default function AnalyticsRisk({ positions, positionGreeks, greeks }: Props) {
  const riskData = useMemo(() => {
    if (positions.length === 0) return null;

    const now = new Date().toISOString();

    // Concentration
    const concentration = computeConcentrationBreakdown(positions, positionGreeks, new Map());

    // Expiration risk
    const expirationBuckets = computeExpirationRisk(positions, positionGreeks);

    // Assignment risks
    const underlyingPrices = new Map<string, number>();
    for (const p of positions) {
      if (p.marketPrice != null) underlyingPrices.set(p.symbol, p.marketPrice);
    }
    const assignmentRisks = computeAssignmentRisks(
      positions, underlyingPrices, new Map(),
    );

    // Buying power
    const buyingPower = computeBuyingPower(positions, null);

    // Gross notional
    const notional = computeGrossNotional(positions);

    // Stress test
    const stressGrid = runStressTest(
      positionGreeks,
      underlyingPrices,
      positions.reduce((s, p) => s + (p.marketValue ?? 0), 0),
      now,
    );
    const worst = worstScenario(stressGrid);

    // Risk classification
    const riskClasses = classifyRiskDefinitions(positions);

    // Composite risk
    const expirationClustering = expirationBuckets.length > 0
      ? Math.max(...expirationBuckets.map((b) => b.thetaConcentration))
      : 0;
    const highRiskAssignments = assignmentRisks.filter((r) => r.riskLevel === "high").length;

    const composite = computeCompositeRiskStatus({
      buyingPowerUsagePct: buyingPower.usagePct,
      stressLossPct: worst?.estimatedPnLPct != null ? Math.abs(worst.estimatedPnLPct) : null,
      tickerConcentrationTop1: concentration.top1Pct,
      sectorConcentrationTop1: concentration.bySector[0]?.pct ?? 0,
      expirationClusteringPct: expirationClustering,
      assignmentRiskCount: highRiskAssignments,
      undefinedRiskPct: riskClasses.undefined.length / Math.max(positions.length, 1),
    });

    // Correlation groups
    const correlationGroups = identifyCorrelationGroups(positions);

    return {
      concentration,
      expirationBuckets,
      assignmentRisks,
      buyingPower,
      notional,
      stressGrid,
      worst,
      riskClasses,
      composite,
      correlationGroups,
    };
  }, [positions, positionGreeks]);

  if (!riskData) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-400">
        No position data available.
      </div>
    );
  }

  const {
    concentration,
    expirationBuckets,
    assignmentRisks,
    buyingPower,
    notional,
    stressGrid,
    composite,
    correlationGroups,
    riskClasses,
  } = riskData;

  const highRiskCount = assignmentRisks.filter((r) => r.riskLevel === "high").length;
  const medRiskCount = assignmentRisks.filter((r) => r.riskLevel === "medium").length;

  return (
    <div className="space-y-4">
      <DataFreshnessBadge info={freshnessFromAge(greeks.timestamp ? Date.now() - new Date(greeks.timestamp).getTime() : null)} asOf={greeks.timestamp} />
      {/* ── Top summary cards ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCardView
          title="Risk Status"
          value={composite.overallStatus.toUpperCase()}
          subtitle={`Score: ${(composite.overallScore * 100).toFixed(0)}/100`}
          status={composite.overallStatus}
          description="Composite from 7 weighted components"
        />
        <MetricCardView
          title="Buying Power"
          value={buyingPower.usagePct != null ? `${(buyingPower.usagePct * 100).toFixed(0)}%` : "—"}
          subtitle={`Value: ${formatCurrency(buyingPower.totalMarketValue)}`}
          status={buyingPower.status}
        />
        <MetricCardView
          title="Net Delta"
          value={greeks.netDelta.toFixed(0)}
          subtitle={`$${formatCurrency(greeks.netDeltaDollars)}`}
          status={greeks.netDelta > 0 ? "positive" : "neutral"}
          description="Portfolio directional exposure"
        />
        <MetricCardView
          title="Gross Notional"
          value={formatCurrency(notional)}
          subtitle="Total notional exposure"
          status="neutral"
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCardView
          title="Downside Stress"
          value={riskData.worst ? formatCurrency(riskData.worst.estimatedPnL) : "—"}
          subtitle={riskData.worst
            ? `${riskData.worst.label} (${formatPercent(riskData.worst.estimatedPnLPct)})`
            : "No scenarios run"}
          status={riskData.worst && (riskData.worst.estimatedPnLPct ?? 0) < -0.1 ? "critical" : "warning"}
        />
        <MetricCardView
          title="Net Gamma"
          value={greeks.netGamma.toFixed(2)}
          subtitle="Convexity exposure"
          status={greeks.netGamma > 0 ? "positive" : "neutral"}
        />
        <MetricCardView
          title="Net Vega"
          value={greeks.netVega.toFixed(2)}
          subtitle="Volatility sensitivity"
          status="neutral"
        />
        <MetricCardView
          title="Net Theta"
          value={`$${greeks.netTheta.toFixed(2)}/day`}
          subtitle="Time decay"
          status={greeks.netTheta > 0 ? "positive" : "warning"}
        />
      </div>

      {/* ── Composite risk breakdown ── */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 text-xs font-medium text-zinc-500">Risk Composite Breakdown</h3>
        <div className="space-y-1.5">
          {composite.components.map((c) => (
            <div key={c.label} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <StatusBadge status={c.status} />
                <span className="text-zinc-700 dark:text-zinc-300">{c.label}</span>
                <span className="text-zinc-400">({(c.weight * 100).toFixed(0)}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">{c.detail}</span>
                <span className="w-8 text-right tabular-nums font-medium text-zinc-600 dark:text-zinc-400">
                  {(c.rawValue * 100).toFixed(0)}
                </span>
              </div>
            </div>
          ))}
          <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-zinc-700 dark:text-zinc-300">Overall</span>
              <span className={RISK_COLORS[composite.overallStatus]}>
                {(composite.overallScore * 100).toFixed(0)} / 100 · {composite.overallStatus}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stress test matrix ── */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 text-xs font-medium text-zinc-500">Stress Test Matrix</h3>
        <p className="mb-2 text-[10px] text-zinc-400">
          Estimated P&L using delta-gamma-theta-vega approximation. Modeled, not guaranteed.
        </p>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {stressGrid.scenarios.map((s) => (
            <div
              key={s.label}
              className={`rounded-md border p-2 text-center ${
                (s.estimatedPnLPct ?? 0) < -0.1
                  ? "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10"
                  : (s.estimatedPnLPct ?? 0) < 0
                    ? "border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10"
                    : "border-zinc-100 dark:border-zinc-800"
              }`}
            >
              <p className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">{s.label}</p>
              <p className={`text-xs font-bold tabular-nums ${
                (s.estimatedPnL ?? 0) >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}>
                {formatCurrency(s.estimatedPnL)}
              </p>
              {s.estimatedPnLPct != null && (
                <p className="text-[10px] text-zinc-400">{formatPercent(s.estimatedPnLPct)}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Concentration + Expiration side by side ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Concentration bar chart */}
        {concentration.bySymbol.length > 0 && (
          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-3 text-xs font-medium text-zinc-500">
              Concentration by Symbol
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={concentration.bySymbol.slice(0, 10)}
                layout="vertical"
                margin={{ top: 5, right: 5, bottom: 5, left: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <YAxis type="category" dataKey="symbol" tick={{ fontSize: 10 }} stroke="#a1a1aa" width={35} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                />
                <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                  {concentration.bySymbol.slice(0, 10).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex gap-4 text-[10px] text-zinc-400">
              <span>Top 1: {formatPercent(concentration.top1Pct)}</span>
              <span>Top 3: {formatPercent(concentration.top3Pct)}</span>
              <span>Top 5: {formatPercent(concentration.top5Pct)}</span>
            </div>
          </section>
        )}

        {/* Expiration risk */}
        {expirationBuckets.length > 0 && (
          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-3 text-xs font-medium text-zinc-500">Expiration Risk</h3>
            <div className="space-y-1.5">
              {expirationBuckets.map((b) => (
                <div
                  key={b.label}
                  className={`flex items-center justify-between rounded-md border p-2 ${
                    b.range[0] <= 7
                      ? "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10"
                      : "border-zinc-100 dark:border-zinc-800"
                  }`}
                >
                  <div>
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {b.label}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      {b.symbols.slice(0, 4).join(", ")}
                      {b.symbols.length > 4 ? ` +${b.symbols.length - 4} more` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold tabular-nums text-zinc-800 dark:text-zinc-200">
                      {b.contracts} contracts
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      {formatPercent(b.thetaConcentration)} theta
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Assignment risk list ── */}
      {assignmentRisks.length > 0 && (
        <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h3 className="text-xs font-medium text-zinc-500">
              Assignment Risk ({highRiskCount} high, {medRiskCount} medium)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-zinc-400 dark:border-zinc-800">
                  <th className="px-4 py-2 font-medium">Symbol</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">Strike</th>
                  <th className="px-4 py-2 text-right font-medium">DTE</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {assignmentRisks.map((r, i) => (
                  <tr
                    key={`${r.symbol}-${i}`}
                    className={`border-b border-zinc-50 dark:border-zinc-800/50 ${
                      r.riskLevel === "high"
                        ? "bg-red-50/50 dark:bg-red-900/10"
                        : r.riskLevel === "medium"
                          ? "bg-amber-50/50 dark:bg-amber-900/10"
                          : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                      {r.symbol}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">
                      {r.optionType === "put" ? "Short Put" : "Short Call"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                      ${r.strike}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                      {r.daysToExpiration}d
                    </td>
                    <td className="px-4 py-2">
                      {r.isItm ? (
                        <StatusBadge status="warning" />
                      ) : (
                        <StatusBadge status="ok" />
                      )}
                      <span className="ml-1 text-zinc-500">
                        {r.isItm ? "ITM" : "OTM"}
                        {r.distancePct != null && ` (${formatPercent(r.distancePct)})`}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={r.riskLevel === "high" ? "critical" : r.riskLevel === "medium" ? "warning" : "ok"} />
                      <span className="ml-1 text-zinc-400 text-[10px]">
                        {r.factors.join(" · ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Correlation groups + Risk classification side by side ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Correlation groups */}
        {correlationGroups.length > 0 && (
          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-3 text-xs font-medium text-zinc-500">
              Correlation Risk
            </h3>
            <div className="space-y-2">
              {correlationGroups.map((g) => (
                <div key={g.label} className="rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-900/30 dark:bg-amber-900/10">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      {g.label}
                    </p>
                    <p className="text-xs font-bold tabular-nums text-amber-700 dark:text-amber-400">
                      {formatPercent(g.totalPct)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-500">
                    {g.symbols.join(", ")}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-400">{g.rationale}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Risk classification */}
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-xs font-medium text-zinc-500">Risk Classification</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
              <span className="text-xs text-zinc-700 dark:text-zinc-300">Defined Risk</span>
              <span className="text-xs font-bold tabular-nums text-emerald-600">
                {riskClasses.defined.length} positions · {formatCurrency(riskClasses.defined.reduce((s, p) => s + (p.marketValue ?? 0), 0))}
              </span>
            </div>
            <div className={`flex items-center justify-between rounded-md border p-2 ${
              riskClasses.undefined.length > 0
                ? "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10"
                : "border-zinc-100 dark:border-zinc-800"
            }`}>
              <span className="text-xs text-zinc-700 dark:text-zinc-300">Undefined Risk</span>
              <span className={`text-xs font-bold tabular-nums ${
                riskClasses.undefined.length > 0 ? "text-red-600" : "text-zinc-600"
              }`}>
                {riskClasses.undefined.length} positions · {formatCurrency(riskClasses.undefined.reduce((s, p) => s + (p.marketValue ?? 0), 0))}
              </span>
            </div>
          </div>
          {riskClasses.undefined.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] text-zinc-400">
                Undefined risk positions cannot have a maximum loss reliably calculated.
                {riskClasses.undefined.filter(p => p.optionType === "call").length > 0 &&
                  " Short calls carry theoretically unlimited loss."}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
