// ── Portfolio Analytics: shared types ──
// All calculation functions use these normalized types so the library
// never depends on Electric shapes or Market Lake types directly.

export interface NormalizedPosition {
  symbol: string;
  quantity: number; // shares for stock, contracts for options
  avgCost: number | null;
  marketPrice: number | null;
  marketValue: number | null;
  unrealizedPnL: number | null;
  realizedPnL: number | null;
  assetType: "stock" | "option" | "crypto" | "cash" | "other";
  institution: string;
  accountName: string;
  // option-specific
  optionType?: "call" | "put";
  optionStrike?: number | null;
  optionExpiry?: string | null;
}

export interface NormalizedTrade {
  tradeId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  proceeds: number | null;
  date: string;
  isOption: boolean;
  optionType?: "call" | "put" | null;
  optionStrike?: number | null;
  optionExpiry?: string | null;
  institution: string;
}

export interface OptionGreekSnapshot {
  symbol: string;
  side: "call" | "put";
  strike: number | null;
  expiration: string | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  impliedVolatility: number | null;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  volume: number | null;
  openInterest: number | null;
  timestamp: string | null;
}

export interface PositionGreek {
  symbol: string;
  quantity: number;
  optionType: "call" | "put";
  strike: number | null;
  expiration: string | null;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  // dollar-normalized
  deltaDollars: number;
  // data quality
  greeksAvailable: boolean;
  greekSource: "market-lake" | "estimated" | "unavailable";
}

export interface AggregatedGreeks {
  asOf: string;
  netDelta: number;
  netDeltaDollars: number;
  netGamma: number;
  netTheta: number;
  netVega: number;
  netRho: number;
  positionGreeks: PositionGreek[];
  positionsWithoutGreeks: string[];
}

export interface IncomeMetrics {
  asOf: string;
  netDailyTheta: number;
  netDailyThetaFormatted: string;
  realizedPnL: {
    today: number;
    mtd: number;
    ytd: number;
    lifetime: number;
  };
  netPremiumCashFlow: {
    creditsReceived: number;
    debitsPaid: number;
    closingCosts: number;
    commissionsAndFees: number;
    netFlow: number;
  };
  unrealizedOptionPnL: number;
  returnOnCapital: {
    realizedRoc: number | null;
    allocatedCapital: number;
    methodology: string;
  };
  thetaEfficiency: {
    dollarsPerDay: number;
    bpsPerDay: number | null;
    allocatedCapital: number;
  };
  incomeConcentration: {
    top1Pct: number;
    top3Pct: number;
    top5Pct: number;
    topSymbols: Array<{ symbol: string; theta: number; pct: number }>;
  };
  incomeStability: {
    weekly: { positivePct: number; avgAmount: number; stdDev: number; periodCount: number };
    monthly: { positivePct: number; avgAmount: number; stdDev: number; periodCount: number };
  } | null;
}

export interface ScenarioResult {
  label: string;
  type: "price" | "vol" | "time" | "combined";
  priceChangePct: number | null;
  ivChangePoints: number | null;
  daysElapsed: number | null;
  estimatedPnL: number;
  estimatedPnLPct: number | null;
  portfolioValue: number;
}

export interface StressTestGrid {
  asOf: string;
  portfolioValue: number;
  scenarios: ScenarioResult[];
  approximationMethod: "delta-gamma" | "full-reprice";
}

export type MetricCardStatus = "positive" | "neutral" | "watch" | "warning" | "critical" | "unavailable";
export type DataQuality = "complete" | "partial" | "stale" | "estimated" | "unavailable";

export interface MetricCardContributor {
  label: string;
  value: number;
  formattedValue: string;
  pct: number | null;
}

export interface MetricCard {
  id: string;
  title: string;
  value: number | null;
  formattedValue: string;
  unit: string;
  description: string;
  asOf: string;
  status: MetricCardStatus;
  dataQuality: DataQuality;
  methodology: string;
  comparisonValue: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  trendData: Array<{ label: string; value: number }> | null;
  contributors: MetricCardContributor[];
  drilldownRoute: string | null;
}

export type IncomeSource =
  | "short_put"
  | "covered_call"
  | "credit_spread"
  | "long_premium"
  | "dividend"
  | "stock_gains"
  | "other";

export interface IncomeBreakdown {
  source: IncomeSource;
  label: string;
  amount: number;
  pct: number | null;
}

export interface ThetaBySymbol {
  symbol: string;
  thetaPerDay: number;
  pct: number;
  expiration: string | null;
  strategy: string;
}

export interface IncomeForecast {
  scenario: string;
  label: string;
  type: "current-theta" | "conservative" | "base" | "optimistic";
  estimatedMonthlyIncome: number;
  assumptions: string[];
  confidence: "low" | "medium" | "high";
}
