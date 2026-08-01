"use client";

import { useMemo, useState } from "react";

import {
  generateOpportunities,
  buildPositionStates,
  scoreOpportunities,
  rankOpportunities,
  estimateScenarioPnL,
  formatCurrency,
  OPPORTUNITY_LABELS,
  DEFAULT_OPPORTUNITY_CONFIG,
} from "@/lib/portfolio-analytics";
import type {
  NormalizedPosition,
  NormalizedTrade,
  AggregatedGreeks,
  Opportunity,
  OpportunityCategory,
} from "@/lib/portfolio-analytics";

const SCORE_COLORS: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const LIQ_COLORS: Record<string, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  adequate: "text-amber-500 dark:text-amber-400",
  poor: "text-red-600 dark:text-red-400",
  unknown: "text-zinc-400",
};

const ALL_CATEGORIES: Array<OpportunityCategory> = [
  "roll_candidate",
  "close_or_reduce",
  "buying_power_release",
  "risk_reduction",
  "concentration_reduction",
  "income_enhancement",
];

export default function AnalyticsOpportunities({
  positions,
  trades,
  greeks,
}: {
  positions: NormalizedPosition[];
  trades: NormalizedTrade[];
  greeks: AggregatedGreeks;
}) {
  const [filterCategory, setFilterCategory] = useState<OpportunityCategory | "all">("all");
  const [sortBy, setSortBy] = useState<"score" | "dte" | "credit">("score");

  const totalPortfolioValue = useMemo(
    () => positions.reduce((s, p) => s + (p.marketValue ?? 0), 0),
    [positions],
  );

  const states = useMemo(
    () =>
      buildPositionStates(
        positions,
        greeks.positionGreeks,
        totalPortfolioValue,
        (g, priceChangePct, price) => estimateScenarioPnL(g, priceChangePct, price, 0, 0),
      ),
    [positions, greeks.positionGreeks, totalPortfolioValue],
  );

  const opportunities = useMemo(() => {
    const opps = generateOpportunities(states, DEFAULT_OPPORTUNITY_CONFIG);
    scoreOpportunities(opps);
    return opps;
  }, [states]);

  const filtered = useMemo(() => {
    let list = filterCategory === "all"
      ? [...opportunities]
      : opportunities.filter((o) => o.category === filterCategory);

    switch (sortBy) {
      case "dte":
        list.sort((a, b) => (a.daysToExpiration ?? 999) - (b.daysToExpiration ?? 999));
        break;
      case "credit":
        list.sort((a, b) => (b.estimatedCredit ?? 0) - (a.estimatedCredit ?? 0));
        break;
      default:
        list = rankOpportunities(list);
    }
    return list;
  }, [opportunities, filterCategory, sortBy]);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<OpportunityCategory | "all", number>> = { all: opportunities.length };
    for (const cat of ALL_CATEGORIES) {
      counts[cat] = opportunities.filter((o) => o.category === cat).length;
    }
    return counts;
  }, [opportunities]);

  if (opportunities.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-zinc-400">
        <p>No opportunities detected</p>
        <p className="text-xs">Opportunities surface when positions meet actionable thresholds — low DTE, high profit capture, concentration, etc.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(["all", ...ALL_CATEGORIES] as const).map((cat) => {
          const count = categoryCounts[cat] ?? 0;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                filterCategory === cat
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {cat === "all" ? "All" : OPPORTUNITY_LABELS[cat]}
              <span className="ml-1 opacity-60">{count}</span>
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-zinc-400">Sort:</span>
          {(["score", "dte", "credit"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`rounded px-1.5 py-0.5 text-xs ${
                sortBy === s
                  ? "bg-zinc-200 font-medium text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              {s === "score" ? "Score" : s === "dte" ? "DTE" : "Credit"}
            </button>
          ))}
        </div>
      </div>

      {/* Opportunity cards */}
      <div className="space-y-3">
        {filtered.map((opp) => (
          <OpportunityCard key={opp.opportunityId} opp={opp} />
        ))}
      </div>
    </div>
  );
}

function OpportunityCard({ opp }: { opp: Opportunity }) {
  const [expanded, setExpanded] = useState(false);

  const confClass = SCORE_COLORS[opp.confidence] ?? "";
  const scorePct = (opp.score * 100).toFixed(0);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold dark:bg-zinc-800">
          {scorePct}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{opp.symbol}</span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {OPPORTUNITY_LABELS[opp.category]}
            </span>
          </div>
          <p className="mt-0.5 text-sm">{opp.proposedAction}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            {opp.daysToExpiration != null && (
              <span>DTE: {opp.daysToExpiration}d</span>
            )}
            {opp.estimatedCredit != null && opp.estimatedCredit > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">
                Credit: {formatCurrency(opp.estimatedCredit)}
              </span>
            )}
            {opp.capitalReleased != null && opp.capitalReleased > 0 && (
              <span>Release: {formatCurrency(opp.capitalReleased)}</span>
            )}
            <span className={LIQ_COLORS[opp.liquidity]}>
              Liq: {opp.liquidity}
            </span>
            {opp.eventRisk && (
              <span className="text-red-600 dark:text-red-400">Event risk</span>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${confClass}`}>
          {opp.confidence}
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-zinc-100 px-3 pb-3 pt-2 dark:border-zinc-800">
          {/* Why now */}
          <div className="mb-2">
            <h4 className="text-xs font-medium text-zinc-500">Why now</h4>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">{opp.whyNow}</p>
          </div>

          {/* Reasons */}
          {opp.reasons.length > 0 && (
            <div className="mb-2">
              <h4 className="text-xs font-medium text-zinc-500">Reasons</h4>
              <ul className="mt-0.5 space-y-0.5">
                {opp.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                    <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Before / After comparison */}
          <div className="mb-2">
            <h4 className="text-xs font-medium text-zinc-500">Before → After</h4>
            <div className="mt-1 grid grid-cols-3 gap-1 text-xs">
              <ComparisonRow
                label="Delta"
                before={opp.currentRisk.delta}
                after={opp.estimatedRiskAfter.delta}
                format={(v) => v.toFixed(1)}
              />
              <ComparisonRow
                label="Theta"
                before={opp.currentRisk.theta}
                after={opp.estimatedRiskAfter.theta}
                format={formatCurrency}
              />
              <ComparisonRow
                label="Stress -10%"
                before={opp.currentRisk.stressLoss10Pct}
                after={opp.estimatedRiskAfter.stressLoss10Pct}
                format={formatCurrency}
              />
              <ComparisonRow
                label="Concentration"
                before={opp.currentRisk.concentrationPct}
                after={opp.estimatedRiskAfter.concentrationPct}
                format={(v) => `${(v * 100).toFixed(1)}%`}
              />
              <ComparisonRow
                label="Income/day"
                before={opp.currentIncomeContribution ?? 0}
                after={opp.estimatedIncomeAfter}
                format={formatCurrency}
              />
            </div>
          </div>

          {/* Score breakdown */}
          {opp.scoreBreakdown && (
            <div className="mb-2">
              <h4 className="text-xs font-medium text-zinc-500">Score: {(opp.score * 100).toFixed(0)}%</h4>
              <div className="mt-1 space-y-0.5 text-xs">
                <ScoreBar label="Benefit" value={opp.scoreBreakdown.expectedBenefit} />
                <ScoreBar label="Risk-Adj Return" value={opp.scoreBreakdown.riskAdjustedReturn} />
                <ScoreBar label="Liquidity" value={opp.scoreBreakdown.liquidity} />
                <ScoreBar label="Portfolio Fit" value={opp.scoreBreakdown.portfolioFit} />
                <ScoreBar label="Buying Power" value={opp.scoreBreakdown.buyingPowerImpact} />
                <ScoreBar label="Diversification" value={opp.scoreBreakdown.diversificationImprovement} />
                <ScoreBar label="Timing" value={opp.scoreBreakdown.timingUrgency} />
                <ScoreBar label="Data Confidence" value={opp.scoreBreakdown.dataConfidence} />
              </div>
              {opp.scoreBreakdown.penalties.length > 0 && (
                <div className="mt-1 space-y-0.5 border-t border-red-100 pt-1 dark:border-red-900/30">
                  {opp.scoreBreakdown.penalties.map((p, i) => (
                    <div key={i} className="flex justify-between text-red-600 dark:text-red-400">
                      <span>{p.reason}</span>
                      <span>−{(p.deduction * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Trade-offs */}
          {opp.tradeOffs.length > 0 && (
            <div className="mb-2">
              <h4 className="text-xs font-medium text-zinc-500">Trade-offs</h4>
              <ul className="mt-0.5 space-y-0.5">
                {opp.tradeOffs.map((t, i) => (
                  <li key={i} className="flex items-start gap-1 text-xs text-zinc-500">
                    <span className="mt-0.5 shrink-0">⚠</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Blocking reasons */}
          {opp.blockingReasons.length > 0 && (
            <div className="rounded bg-red-50 p-2 dark:bg-red-900/10">
              <h4 className="text-xs font-medium text-red-600 dark:text-red-400">Blocked</h4>
              <ul className="mt-0.5 space-y-0.5">
                {opp.blockingReasons.map((b, i) => (
                  <li key={i} className="text-xs text-red-600 dark:text-red-400">
                    • {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-2 text-right text-xs text-zinc-400">
            {new Date(opp.calculationTimestamp).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

function ComparisonRow({
  label,
  before,
  after,
  format,
}: {
  label: string;
  before: number;
  after: number | null;
  format: (v: number) => string;
}) {
  const hasChange = after != null && after !== before;
  return (
    <div className="flex items-center justify-between rounded bg-zinc-50 px-1.5 py-0.5 dark:bg-zinc-800/50">
      <span className="text-zinc-400">{label}</span>
      <span className="font-mono">
        <span className="text-zinc-600 dark:text-zinc-300">{format(before)}</span>
        {after != null && hasChange && (
          <span className="ml-1 text-zinc-400">
            → <span className={after > before ? "text-emerald-600" : "text-red-600"}>
              {format(after)}
            </span>
          </span>
        )}
      </span>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = (value * 100).toFixed(0);
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-zinc-400">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-zinc-400 dark:bg-zinc-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums text-zinc-500">{pct}%</span>
    </div>
  );
}
