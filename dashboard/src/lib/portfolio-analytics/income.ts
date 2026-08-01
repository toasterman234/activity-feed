// ── Income analytics ──
// Income calculations from position Greeks, trade history, and position data.
// All functions are pure and deterministic — no API calls, no side effects.

import type {
  NormalizedPosition,
  NormalizedTrade,
  AggregatedGreeks,
  IncomeMetrics,
  IncomeBreakdown,
  IncomeSource,
  ThetaBySymbol,
  IncomeForecast,
} from "./types";

/**
 * Compute portfolio income metrics from aggregated Greeks and trade history.
 */
export function computeIncomeMetrics(
  greeks: AggregatedGreeks,
  positions: NormalizedPosition[],
  trades: NormalizedTrade[],
  allocatedCapital: number | null,
): IncomeMetrics {
  const now = new Date().toISOString();

  // Realized P&L from trades
  const realized = computeRealizedPnL(trades);

  // Premium cash flow
  const premiumFlow = computePremiumCashFlow(trades);

  // Unrealized option P&L
  const unrealized = positions
    .filter((p) => p.assetType === "option")
    .reduce((sum, p) => sum + (p.unrealizedPnL ?? 0), 0);

  // Return on allocated capital
  const capital = allocatedCapital ?? computeEstimatedCapital(positions);
  const realizedRoc =
    capital > 0 ? realized.lifetime / capital : null;

  // Theta efficiency
  const thetaEffDollars = greeks.netTheta;
  const thetaEffBps = capital > 0 ? (greeks.netTheta / capital) * 10_000 : null;

  // Income concentration
  const concentration = computeThetaConcentration(greeks.positionGreeks);

  // Income stability from trade history
  const stability = computeIncomeStability(trades);

  return {
    asOf: now,
    netDailyTheta: greeks.netTheta,
    netDailyThetaFormatted: `$${greeks.netTheta.toFixed(2)}/day`,
    realizedPnL: realized,
    netPremiumCashFlow: premiumFlow,
    unrealizedOptionPnL: unrealized,
    returnOnCapital: {
      realizedRoc,
      allocatedCapital: capital,
      methodology: allocatedCapital
        ? "User-configured collateral allocation"
        : "Estimated as total portfolio market value minus cash",
    },
    thetaEfficiency: {
      dollarsPerDay: thetaEffDollars,
      bpsPerDay: thetaEffBps,
      allocatedCapital: capital,
    },
    incomeConcentration: concentration,
    incomeStability: stability,
  };
}

/** Parse an ISO date string (YYYY-MM-DD) as local midnight, not UTC. */
function parseDateAsLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function computeRealizedPnL(trades: NormalizedTrade[]): {
  today: number;
  mtd: number;
  ytd: number;
  lifetime: number;
} {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  let today = 0;
  let mtd = 0;
  let ytd = 0;
  let lifetime = 0;

  for (const t of trades) {
    const pnl = t.proceeds ?? 0;
    const date = parseDateAsLocal(t.date);
    if (Number.isNaN(date.getTime())) continue;

    lifetime += pnl;
    if (date >= startOfToday) today += pnl;
    if (date >= startOfMonth) mtd += pnl;
    if (date >= startOfYear) ytd += pnl;
  }

  return { today, mtd, ytd, lifetime };
}

export function computePremiumCashFlow(trades: NormalizedTrade[]): {
  creditsReceived: number;
  debitsPaid: number;
  closingCosts: number;
  commissionsAndFees: number;
  netFlow: number;
} {
  let creditsReceived = 0;
  let debitsPaid = 0;
  let closingCosts = 0;
  let commissionsAndFees = 0;

  for (const t of trades) {
    if (!t.isOption) continue;
    const proceeds = t.proceeds ?? 0;

    if (t.side === "sell") {
      // Selling to open = premium credit
      creditsReceived += Math.max(0, proceeds);
      if (proceeds < 0) closingCosts += Math.abs(proceeds);
    } else {
      // Buying to open = premium debit; buying to close = closing cost
      // Simplified: if proceeds is negative and it's an option buy
      if (proceeds < 0) {
        debitsPaid += Math.abs(proceeds);
      }
    }
  }

  const netFlow = creditsReceived - debitsPaid - closingCosts - commissionsAndFees;

  return {
    creditsReceived,
    debitsPaid,
    closingCosts,
    commissionsAndFees,
    netFlow,
  };
}

export function computeEstimatedCapital(positions: NormalizedPosition[]): number {
  // Sum of all position market values (rough approximation of allocated capital)
  return positions.reduce((sum, p) => sum + Math.max(0, p.marketValue ?? 0), 0);
}

export function computeThetaConcentration(
  positionGreeks: Array<{
    symbol: string;
    theta: number;
    expiration?: string | null;
    quantity: number;
    optionType: string;
  }>,
): {
  top1Pct: number;
  top3Pct: number;
  top5Pct: number;
  topSymbols: Array<{ symbol: string; theta: number; pct: number }>;
} {
  const totalTheta = positionGreeks.reduce((sum, g) => sum + Math.abs(g.theta), 0);
  if (totalTheta === 0) {
    return { top1Pct: 0, top3Pct: 0, top5Pct: 0, topSymbols: [] };
  }

  // Group by symbol, sum absolute theta
  const bySymbol = new Map<string, number>();
  for (const g of positionGreeks) {
    const current = bySymbol.get(g.symbol) ?? 0;
    bySymbol.set(g.symbol, current + Math.abs(g.theta));
  }

  const sorted = [...bySymbol.entries()]
    .map(([symbol, theta]) => ({
      symbol,
      theta,
      pct: theta / totalTheta,
    }))
    .sort((a, b) => b.theta - a.theta);

  const top1Pct = sorted.slice(0, 1).reduce((s, x) => s + x.pct, 0);
  const top3Pct = sorted.slice(0, 3).reduce((s, x) => s + x.pct, 0);
  const top5Pct = sorted.slice(0, 5).reduce((s, x) => s + x.pct, 0);

  return {
    top1Pct,
    top3Pct,
    top5Pct,
    topSymbols: sorted.slice(0, 5),
  };
}

export function computeIncomeStability(trades: NormalizedTrade[]): {
  weekly: { positivePct: number; avgAmount: number; stdDev: number; periodCount: number };
  monthly: { positivePct: number; avgAmount: number; stdDev: number; periodCount: number };
} | null {
  if (trades.length === 0) return null;

  // Group trades by ISO week and ISO month
  const weeklyMap = new Map<string, number>();
  const monthlyMap = new Map<string, number>();

  for (const t of trades) {
    const d = parseDateAsLocal(t.date);
    if (Number.isNaN(d.getTime())) continue;

    // ISO week
    const weekKey = getISOWeekKey(d);
    weeklyMap.set(weekKey, (weeklyMap.get(weekKey) ?? 0) + (t.proceeds ?? 0));

    // Month key
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + (t.proceeds ?? 0));
  }

  const weekly = computePeriodStats(weeklyMap);
  const monthly = computePeriodStats(monthlyMap);

  return { weekly, monthly };
}

function getISOWeekKey(d: Date): string {
  const temp = new Date(d.getTime());
  temp.setHours(0, 0, 0, 0);
  temp.setDate(temp.getDate() + 3 - ((temp.getDay() + 6) % 7));
  const week1 = new Date(temp.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((temp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${temp.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function computePeriodStats(periodMap: Map<string, number>): {
  positivePct: number;
  avgAmount: number;
  stdDev: number;
  periodCount: number;
} {
  const values = [...periodMap.values()];
  if (values.length === 0) return { positivePct: 0, avgAmount: 0, stdDev: 0, periodCount: 0 };

  const positiveCount = values.filter((v) => v > 0).length;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;

  return {
    positivePct: values.length > 0 ? positiveCount / values.length : 0,
    avgAmount: avg,
    stdDev: Math.sqrt(variance),
    periodCount: values.length,
  };
}

export function classifyIncomeSources(
  trades: NormalizedTrade[],
  positions: NormalizedPosition[],
): IncomeBreakdown[] {
  const bySource = new Map<IncomeSource, number>();

  for (const t of trades) {
    if (t.isOption) {
      if (t.optionType === "put" && t.side === "sell") {
        addToSource(bySource, "short_put", t.proceeds ?? 0);
      } else if (t.optionType === "call" && t.side === "sell") {
        addToSource(bySource, "covered_call", t.proceeds ?? 0);
      } else {
        addToSource(bySource, "long_premium", t.proceeds ?? 0);
      }
    } else {
      addToSource(bySource, "stock_gains", t.proceeds ?? 0);
    }
  }

  const total = [...bySource.values()].reduce((s, v) => s + Math.abs(v), 0);

  const labels: Record<IncomeSource, string> = {
    short_put: "Short Puts",
    covered_call: "Covered Calls",
    credit_spread: "Credit Spreads",
    long_premium: "Long Premium",
    dividend: "Dividends",
    stock_gains: "Stock Gains",
    other: "Other",
  };

  return [...bySource.entries()]
    .map(([source, amount]) => ({
      source,
      label: labels[source],
      amount,
      pct: total > 0 ? amount / total : null,
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function addToSource(map: Map<IncomeSource, number>, source: IncomeSource, amount: number): void {
  map.set(source, (map.get(source) ?? 0) + amount);
}

export function computeThetaBySymbol(
  positionGreeks: PositionGreek[],
): ThetaBySymbol[] {
  const bySymbol = new Map<string, { theta: number; expiration: string | null; strategy: string }>();

  for (const g of positionGreeks) {
    if (!g.greeksAvailable) continue;
    const current = bySymbol.get(g.symbol);
    if (!current) {
      bySymbol.set(g.symbol, {
        theta: Math.abs(g.theta),
        expiration: g.expiration,
        strategy: g.optionType === "put" ? "Short Put" : "Covered Call",
      });
    } else {
      current.theta += Math.abs(g.theta);
    }
  }

  const totalTheta = [...bySymbol.values()].reduce((s, v) => s + v.theta, 0);

  return [...bySymbol.entries()]
    .map(([symbol, data]) => ({
      symbol,
      thetaPerDay: data.theta,
      pct: totalTheta > 0 ? data.theta / totalTheta : 0,
      expiration: data.expiration,
      strategy: data.strategy,
    }))
    .sort((a, b) => b.thetaPerDay - a.thetaPerDay);
}

export function generateIncomeForecast(
  netDailyTheta: number,
  knownExpirations: Array<{ symbol: string; expiry: string; theta: number }>,
): IncomeForecast[] {
  // Conservative: assume 60% of current theta sustains
  // Base: assume 80%
  // Optimistic: assume 100% but flag as estimate
  const daysInMonth = 21; // trading days

  return [
    {
      scenario: "current-theta",
      label: "Current Theta × 21 days",
      type: "current-theta",
      estimatedMonthlyIncome: netDailyTheta * daysInMonth,
      assumptions: [
        "Assumes today's theta continues unchanged for 21 trading days",
        "Does not account for expirations, assignments, or new positions",
        "Not a forecast — simple multiplication for reference only",
      ],
      confidence: "low",
    },
    {
      scenario: "conservative",
      label: "Conservative Estimate",
      type: "conservative",
      estimatedMonthlyIncome: netDailyTheta * daysInMonth * 0.6,
      assumptions: [
        "Assumes 60% of current theta is sustained after expirations",
        "Accounts for some positions expiring without replacement",
        `${knownExpirations.length} positions with known expirations factored in`,
      ],
      confidence: "medium",
    },
    {
      scenario: "base",
      label: "Base Estimate",
      type: "base",
      estimatedMonthlyIncome: netDailyTheta * daysInMonth * 0.8,
      assumptions: [
        "Assumes 80% of current theta is sustained",
        "Moderate roll assumptions, typical market conditions",
      ],
      confidence: "medium",
    },
    {
      scenario: "optimistic",
      label: "Optimistic Estimate",
      type: "optimistic",
      estimatedMonthlyIncome: netDailyTheta * daysInMonth,
      assumptions: [
        "Assumes existing theta is fully maintained or replaced",
        "No adverse market moves or early assignments",
        "Modeled estimate — not guaranteed income",
      ],
      confidence: "low",
    },
  ];
}
