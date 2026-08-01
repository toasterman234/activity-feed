// ── Opportunity types ──
// All opportunity-related types. Separated to keep types.ts manageable.

import type { NormalizedPosition, NormalizedTrade } from "./types";

export type OpportunityCategory =
  | "manage_existing"
  | "close_or_reduce"
  | "roll_candidate"
  | "expiration_management"
  | "assignment_management"
  | "buying_power_release"
  | "income_enhancement"
  | "risk_reduction"
  | "concentration_reduction"
  | "hedge_candidate"
  | "idle_capital"
  | "new_position";

export const OPPORTUNITY_LABELS: Record<OpportunityCategory, string> = {
  manage_existing: "Manage Position",
  close_or_reduce: "Close / Reduce",
  roll_candidate: "Roll Candidate",
  expiration_management: "Expiration Mgmt",
  assignment_management: "Assignment Mgmt",
  buying_power_release: "Buying Power Release",
  income_enhancement: "Income Enhancement",
  risk_reduction: "Risk Reduction",
  concentration_reduction: "Concentration Reduction",
  hedge_candidate: "Hedge Candidate",
  idle_capital: "Idle Capital",
  new_position: "New Position",
};

export interface Opportunity {
  opportunityId: string;
  symbol: string;
  category: OpportunityCategory;
  proposedAction: string;
  // Why was this surfaced
  reasons: string[];
  whyNow: string;
  // Estimated financial impact
  estimatedCredit: number | null;
  estimatedDebit: number | null;
  capitalRequired: number | null;
  capitalReleased: number | null;
  // Risk impact (before → after)
  currentRisk: RiskSnapshot;
  estimatedRiskAfter: RiskSnapshot;
  // Income impact
  currentIncomeContribution: number | null;
  estimatedIncomeAfter: number | null;
  // Position details
  daysToExpiration: number | null;
  liquidity: "good" | "adequate" | "poor" | "unknown";
  eventRisk: boolean;
  // Confidence & ranking
  confidence: "high" | "medium" | "low";
  score: number; // 0–1, set by scoring engine
  scoreBreakdown: ScoreBreakdown | null;
  // Trade-offs
  tradeOffs: string[];
  blockingReasons: string[];
  // Data quality
  calculationTimestamp: string;
}

export interface RiskSnapshot {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  stressLoss10Pct: number;
  concentrationPct: number;
}

export interface ScoreBreakdown {
  expectedBenefit: number;
  riskAdjustedReturn: number;
  liquidity: number;
  portfolioFit: number;
  buyingPowerImpact: number;
  diversificationImprovement: number;
  timingUrgency: number;
  dataConfidence: number;
  penalties: PenaltyResult[];
}

export interface PenaltyResult {
  reason: string;
  deduction: number; // positive number subtracted from score
}

// ── Rule engine configuration ──

export interface OpportunityConfig {
  // Roll candidate thresholds
  rollMinDte: number; // days — positions with DTE below this trigger roll
  rollMaxDelta: number; // 0–1 — short option delta above this triggers roll
  rollMinCredit: number; // dollars — minimum net credit to suggest roll
  rollNewMinDte: number; // days — minimum DTE of replacement contract
  rollNewMinOi: number; // minimum open interest for replacement

  // Close-winner thresholds
  closeWinnerMinProfitPct: number; // % of max profit captured
  closeWinnerMaxRemainingReward: number; // dollars — remaining reward below this triggers

  // Buying-power thresholds
  bpReleaseMinPct: number; // % of total BP consumed
  bpReleaseMaxRemainingReturn: number; // remaining expected return below this

  // Risk thresholds
  riskMaxStressLossPct: number; // % of portfolio
  riskMaxConcentrationPct: number; // % per symbol
  riskMaxUndefinedPct: number; // % of portfolio in undefined risk

  // Income enhancement
  incomeMinShares: number; // min shares to be eligible
  incomeMinDte: number; // min DTE for proposed covered call / CSP
  incomeMaxDte: number;
  incomeMinDelta: number; // min delta for proposed short option
  incomeMaxDelta: number;
  incomeMinOi: number;
  incomeMaxSpread: number; // max bid/ask spread %

  // General
  blockedSymbols: string[];
  blockedStrategies: string[];
  newPositionDiscovery: boolean; // off by default — Phase 4
}

export const DEFAULT_OPPORTUNITY_CONFIG: OpportunityConfig = {
  rollMinDte: 7,
  rollMaxDelta: 0.30,
  rollMinCredit: 0.25,
  rollNewMinDte: 21,
  rollNewMinOi: 100,

  closeWinnerMinProfitPct: 0.80,
  closeWinnerMaxRemainingReward: 25,

  bpReleaseMinPct: 0.05, // 5% of total BP
  bpReleaseMaxRemainingReturn: 10, // $10 remaining expected return

  riskMaxStressLossPct: 0.15, // 15% of portfolio
  riskMaxConcentrationPct: 0.30, // 30% per symbol
  riskMaxUndefinedPct: 0.10,

  incomeMinShares: 100,
  incomeMinDte: 14,
  incomeMaxDte: 60,
  incomeMinDelta: 0.20,
  incomeMaxDelta: 0.40,
  incomeMinOi: 100,
  incomeMaxSpread: 0.05,

  blockedSymbols: [],
  blockedStrategies: [],
  newPositionDiscovery: false,
};

// ── Rule engine position state (enriched) ──

export interface PositionState {
  position: NormalizedPosition;
  greekDelta: number;
  greekGamma: number;
  greekTheta: number;
  greekVega: number;
  concentrationPct: number;
  stressLoss: number; // estimated P&L in -10% scenario
  buyingPowerUsage: number;
  buyingPowerTotal: number;
  buyingPowerPct: number;
  hasGreeks: boolean;
  daysToExpiry: number | null;
  isShort: boolean;
  isOption: boolean;
  isItm: boolean | null;
  extrinsicEstimate: number | null;
  openInterest: number | null;
  volume: number | null;
  spreadPct: number | null;
  maxProfit: number | null;
  profitPctCaptured: number | null;
}
