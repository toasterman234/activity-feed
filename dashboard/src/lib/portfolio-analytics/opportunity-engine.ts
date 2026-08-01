// ── Opportunity rule engine ──
// Deterministic rules that scan positions and generate Opportunity objects.
// Each rule is a pure function: takes PositionState[] + config, returns Opportunity[].

import type {
  Opportunity,
  OpportunityCategory,
  OpportunityConfig,
  PositionState,
  RiskSnapshot,
} from "./opportunity-types";
import { DEFAULT_OPPORTUNITY_CONFIG } from "./opportunity-types";
import type { NormalizedPosition, PositionGreek } from "./types";

let _counter = 0;
function nextId(): string {
  _counter += 1;
  return `opp-${Date.now()}-${_counter}`;
}

function emptyRiskSnapshot(): RiskSnapshot {
  return { delta: 0, gamma: 0, theta: 0, vega: 0, stressLoss10Pct: 0, concentrationPct: 0 };
}

/**
 * Run all opportunity rules against the current portfolio state.
 * Returns a flat list of unscored opportunities.
 */
export function generateOpportunities(
  states: PositionState[],
  config: OpportunityConfig = DEFAULT_OPPORTUNITY_CONFIG,
): Opportunity[] {
  const opps: Opportunity[] = [];

  for (const s of states) {
    if (config.blockedSymbols.includes(s.position.symbol)) continue;
    const blocked = isStrategyBlocked(s, config);
    if (blocked) continue;

    // Only generate rules for existing positions
    // (new_position discovery disabled by default)
    opps.push(...rollCandidate(s, config));
    opps.push(...closeWinner(s, config));
    opps.push(...buyingPowerRelease(s, config));
    opps.push(...riskReduction(s, config));
    opps.push(...concentrationReduction(s, config));
    opps.push(...incomeEnhancement(s, config));
  }

  return opps;
}

function isStrategyBlocked(s: PositionState, c: OpportunityConfig): boolean {
  if (s.isOption && s.position.optionType === "put" && c.blockedStrategies.includes("short_put")) return true;
  if (s.isOption && s.position.optionType === "call" && c.blockedStrategies.includes("covered_call")) return true;
  if (!s.isOption && c.blockedStrategies.includes("long_stock")) return true;
  return false;
}

// ── Rule: Roll candidate ──
// Triggered when a short option has low DTE, high delta, or is near/at/through strike.

function rollCandidate(s: PositionState, c: OpportunityConfig): Opportunity[] {
  if (!s.isOption || !s.isShort || s.daysToExpiry == null) return [];

  const reasons: string[] = [];
  const blocking: string[] = [];
  let meetsThreshold = false;

  if (s.daysToExpiry <= c.rollMinDte) {
    reasons.push(`DTE ${s.daysToExpiry}d ≤ threshold ${c.rollMinDte}d`);
    meetsThreshold = true;
  }
  if (s.hasGreeks && Math.abs(s.greekDelta) / Math.abs(s.position.quantity) > c.rollMaxDelta) {
    reasons.push(`Delta ${Math.abs(s.greekDelta / s.position.quantity).toFixed(2)} > max ${c.rollMaxDelta}`);
    meetsThreshold = true;
  }
  if (s.isItm) {
    reasons.push("Option is in-the-money");
    meetsThreshold = true;
  }

  if (!meetsThreshold) return [];

  // Check blocking conditions
  if (s.extrinsicEstimate != null && s.extrinsicEstimate < c.rollMinCredit) {
    blocking.push("No roll credit available (extrinsic < minimum credit)");
  }
  if (s.spreadPct != null && s.spreadPct > c.incomeMaxSpread) {
    blocking.push(`Bid/ask spread ${(s.spreadPct * 100).toFixed(1)}% too wide`);
  }
  if (s.openInterest != null && s.openInterest < c.rollNewMinOi) {
    blocking.push(`Open interest ${s.openInterest} < minimum ${c.rollNewMinOi}`);
  }

  // Estimate net credit: assume rolling for a small credit (extrinsic value)
  const estimatedCredit = s.extrinsicEstimate ?? null;

  return [{
    opportunityId: nextId(),
    symbol: s.position.symbol,
    category: "roll_candidate",
    proposedAction: blocking.length > 0
      ? `Consider rolling ${s.position.symbol} — blocked`
      : `Roll ${s.position.symbol} to ${c.rollNewMinDte}+ DTE`,
    reasons,
    whyNow: s.daysToExpiry <= 3
      ? "Position expires in 3 days or fewer — act quickly to avoid assignment"
      : "Low DTE increases gamma risk and reduces time to manage",
    estimatedCredit: blocking.length > 0 ? null : estimatedCredit,
    estimatedDebit: blocking.length > 0 ? estimatedCredit : null,
    capitalRequired: null,
    capitalReleased: null,
    currentRisk: snapshotFromState(s),
    estimatedRiskAfter: snapshotFromState(s), // placeholder — real after-risk needs proposal
    currentIncomeContribution: s.greekTheta,
    estimatedIncomeAfter: null,
    daysToExpiration: s.daysToExpiry,
    liquidity: classifyLiquidity(s),
    eventRisk: false,
    confidence: blocking.length > 0 ? "low" : "medium",
    score: 0,
    scoreBreakdown: null,
    tradeOffs: [
      "Locks in a new strike and may cap upside",
      "Prolongs position duration",
      "May crystallize a loss if rolled for a debit",
    ],
    blockingReasons: blocking,
    calculationTimestamp: new Date().toISOString(),
  }];
}

// ── Rule: Close winner ──
// Triggered when most of max profit is captured and remaining reward is small.

function closeWinner(s: PositionState, c: OpportunityConfig): Opportunity[] {
  if (!s.isOption || !s.isShort) return [];
  if (s.profitPctCaptured == null || s.maxProfit == null) return [];

  const remainingReward = s.maxProfit - (s.maxProfit * (s.profitPctCaptured));
  if (s.profitPctCaptured < c.closeWinnerMinProfitPct) return [];
  if (remainingReward > c.closeWinnerMaxRemainingReward) return [];

  return [{
    opportunityId: nextId(),
    symbol: s.position.symbol,
    category: "close_or_reduce",
    proposedAction: `Close ${s.position.symbol} — ${(s.profitPctCaptured * 100).toFixed(0)}% of max profit captured`,
    reasons: [
      `Profit capture: ${(s.profitPctCaptured * 100).toFixed(0)}% of maximum`,
      `Remaining reward: $${remainingReward.toFixed(2)} ≤ threshold $${c.closeWinnerMaxRemainingReward}`,
    ],
    whyNow: "Remaining reward is small relative to remaining risk — better to close and redeploy capital",
    estimatedCredit: remainingReward,
    estimatedDebit: null,
    capitalRequired: null,
    capitalReleased: Math.abs(s.position.marketValue ?? 0),
    currentRisk: snapshotFromState(s),
    estimatedRiskAfter: emptyRiskSnapshot(),
    currentIncomeContribution: s.greekTheta,
    estimatedIncomeAfter: 0,
    daysToExpiration: s.daysToExpiry,
    liquidity: classifyLiquidity(s),
    eventRisk: false,
    confidence: "high",
    score: 0,
    scoreBreakdown: null,
    tradeOffs: [
      "Foregoes remaining profit potential",
      "Heads up commission costs on closing trade",
    ],
    blockingReasons: [],
    calculationTimestamp: new Date().toISOString(),
  }];
}

// ── Rule: Buying-power release ──
// Triggered when a position consumes significant BP and has low remaining return.

function buyingPowerRelease(s: PositionState, c: OpportunityConfig): Opportunity[] {
  if (s.buyingPowerPct < c.bpReleaseMinPct) return [];
  if (s.profitPctCaptured != null && s.profitPctCaptured < 0.50) return []; // too early

  const remainingReturn = s.profitPctCaptured != null && s.maxProfit != null
    ? s.maxProfit - (s.maxProfit * s.profitPctCaptured)
    : null;
  if (remainingReturn != null && remainingReturn > c.bpReleaseMaxRemainingReturn) return [];

  return [{
    opportunityId: nextId(),
    symbol: s.position.symbol,
    category: "buying_power_release",
    proposedAction: `Close ${s.position.symbol} — frees ${(s.buyingPowerPct * 100).toFixed(1)}% of buying power`,
    reasons: [
      `Consumes ${(s.buyingPowerPct * 100).toFixed(1)}% of buying power`,
      remainingReturn != null
        ? `Remaining expected return: $${remainingReturn.toFixed(2)}`
        : "Low expected remaining return",
    ],
    whyNow: "Freeing buying power improves flexibility for higher-return opportunities",
    estimatedCredit: remainingReturn,
    estimatedDebit: null,
    capitalRequired: null,
    capitalReleased: s.buyingPowerUsage,
    currentRisk: snapshotFromState(s),
    estimatedRiskAfter: emptyRiskSnapshot(),
    currentIncomeContribution: s.greekTheta,
    estimatedIncomeAfter: 0,
    daysToExpiration: s.daysToExpiry,
    liquidity: classifyLiquidity(s),
    eventRisk: false,
    confidence: "medium",
    score: 0,
    scoreBreakdown: null,
    tradeOffs: [
      "Removes income-generating position",
      "Capital released can be redeployed elsewhere",
    ],
    blockingReasons: [],
    calculationTimestamp: new Date().toISOString(),
  }];
}

// ── Rule: Risk reduction ──
// Triggered when a position contributes significantly to downside stress loss.

function riskReduction(s: PositionState, c: OpportunityConfig): Opportunity[] {
  // Skip if already flagged as roll/close — no duplicate noise
  if (s.profitPctCaptured != null && s.profitPctCaptured > 0.90) return [];

  const reasons: string[] = [];
  if (s.stressLoss < 0 && Math.abs(s.stressLoss) / (s.buyingPowerTotal || 1) > c.riskMaxStressLossPct) {
    reasons.push(`Downside stress loss ${(Math.abs(s.stressLoss) / (s.buyingPowerTotal || 1) * 100).toFixed(1)}% > threshold ${(c.riskMaxStressLossPct * 100).toFixed(0)}%`);
  }
  if (s.concentrationPct > c.riskMaxConcentrationPct) {
    reasons.push(`Concentration ${(s.concentrationPct * 100).toFixed(1)}% > max ${(c.riskMaxConcentrationPct * 100).toFixed(0)}%`);
  }

  if (reasons.length === 0) return [];

  return [{
    opportunityId: nextId(),
    symbol: s.position.symbol,
    category: "risk_reduction",
    proposedAction: `Reduce or hedge ${s.position.symbol} to lower portfolio risk`,
    reasons,
    whyNow: "Elevated risk exposure detected — review position sizing or consider hedging",
    estimatedCredit: null,
    estimatedDebit: Math.abs(s.position.marketValue ?? 0) * 0.25, // rough hedge cost
    capitalRequired: Math.abs(s.position.marketValue ?? 0) * 0.25,
    capitalReleased: null,
    currentRisk: snapshotFromState(s),
    estimatedRiskAfter: {
      ...snapshotFromState(s),
      stressLoss10Pct: s.stressLoss * 0.5,
      concentrationPct: s.concentrationPct * 0.5,
    },
    currentIncomeContribution: s.greekTheta,
    estimatedIncomeAfter: s.greekTheta * 0.5,
    daysToExpiration: s.daysToExpiry,
    liquidity: classifyLiquidity(s),
    eventRisk: false,
    confidence: "medium",
    score: 0,
    scoreBreakdown: null,
    tradeOffs: [
      "Hedging costs reduce net income",
      "Partial reduction keeps core position",
      "May miss upside if market moves favorably",
    ],
    blockingReasons: [],
    calculationTimestamp: new Date().toISOString(),
  }];
}

// ── Rule: Concentration reduction ──

function concentrationReduction(s: PositionState, c: OpportunityConfig): Opportunity[] {
  if (s.concentrationPct < c.riskMaxConcentrationPct) return [];
  if (s.stressLoss > 0) return []; // long-only positions — different handling

  return [{
    opportunityId: nextId(),
    symbol: s.position.symbol,
    category: "concentration_reduction",
    proposedAction: `Trim ${s.position.symbol} — ${(s.concentrationPct * 100).toFixed(0)}% portfolio concentration`,
    reasons: [
      `Concentration ${(s.concentrationPct * 100).toFixed(0)}% exceeds ${(c.riskMaxConcentrationPct * 100).toFixed(0)}% limit`,
    ],
    whyNow: "High concentration increases vulnerability to single-name risk",
    estimatedCredit: Math.abs(s.position.marketValue ?? 0) * 0.5,
    estimatedDebit: null,
    capitalRequired: null,
    capitalReleased: Math.abs(s.position.marketValue ?? 0) * 0.5,
    currentRisk: snapshotFromState(s),
    estimatedRiskAfter: {
      ...snapshotFromState(s),
      stressLoss10Pct: s.stressLoss * 0.5,
      concentrationPct: s.concentrationPct * 0.5,
    },
    currentIncomeContribution: s.greekTheta,
    estimatedIncomeAfter: s.greekTheta * 0.5,
    daysToExpiration: s.daysToExpiry,
    liquidity: classifyLiquidity(s),
    eventRisk: false,
    confidence: "high",
    score: 0,
    scoreBreakdown: null,
    tradeOffs: [
      "Reduces income contribution",
      "Improves diversification",
      "Lowers exposure to single-name events",
    ],
    blockingReasons: [],
    calculationTimestamp: new Date().toISOString(),
  }];
}

// ── Rule: Income enhancement ──
// Triggered when stock positions are eligible for covered calls / CSP.

function incomeEnhancement(s: PositionState, c: OpportunityConfig): Opportunity[] {
  if (!c.newPositionDiscovery) return []; // Phase 4 feature
  if (s.position.assetType !== "stock") return [];
  if (s.position.quantity < c.incomeMinShares) return [];
  if (s.isShort) return [];

  return [{
    opportunityId: nextId(),
    symbol: s.position.symbol,
    category: "income_enhancement",
    proposedAction: `Write covered calls on ${s.position.symbol} shares to generate income`,
    reasons: [
      `${s.position.quantity} shares eligible for covered call writing`,
      "No existing option income from this position",
    ],
    whyNow: "Covered call writing can generate incremental income on existing stock positions",
    estimatedCredit: (s.position.marketValue ?? 0) * 0.02, // rough 2% monthly estimate
    estimatedDebit: null,
    capitalRequired: null,
    capitalReleased: null,
    currentRisk: snapshotFromState(s),
    estimatedRiskAfter: snapshotFromState(s), // same risk profile
    currentIncomeContribution: 0,
    estimatedIncomeAfter: (s.position.marketValue ?? 0) * 0.02,
    daysToExpiration: null,
    liquidity: classifyLiquidity(s),
    eventRisk: false,
    confidence: "low",
    score: 0,
    scoreBreakdown: null,
    tradeOffs: [
      "Caps upside on underlying shares",
      "Generates premium income",
      "May trigger assignment if stock rallies past strike",
    ],
    blockingReasons: c.newPositionDiscovery ? [] : ["New position discovery disabled"],
    calculationTimestamp: new Date().toISOString(),
  }];
}

// ── Position state factory ──
// Builds PositionState[] from normalized portfolio data + Greeks.
// This is the bridge between raw data and the rule engine.
// Called from the UI layer once all data is ready.

export function buildPositionStates(
  positions: NormalizedPosition[],
  positionGreeks: PositionGreek[],
  totalPortfolioValue: number,
  stressTest: (positionGreek: PositionGreek, priceChangePct: number, underlyingPrice: number) => number,
  greekMap?: Map<string, { openInterest?: number | null; volume?: number | null; bid?: number | null; ask?: number | null }>,
): PositionState[] {
  const greeksBySymbol = new Map<string, PositionGreek[]>();
  for (const g of positionGreeks) {
    const key = g.symbol;
    const existing = greeksBySymbol.get(key) ?? [];
    existing.push(g);
    greeksBySymbol.set(key, existing);
  }

  return positions.map((p) => {
    const greeks = greeksBySymbol.get(p.symbol) ?? [];
    const totalGreekDelta = greeks.reduce((s, g) => s + g.delta, 0);
    const totalGreekGamma = greeks.reduce((s, g) => s + g.gamma, 0);
    const totalGreekTheta = greeks.reduce((s, g) => s + g.theta, 0);
    const totalGreekVega = greeks.reduce((s, g) => s + g.vega, 0);
    const hasGreeks = greeks.some((g) => g.greeksAvailable);

    // Stress loss for -10% scenario
    let stressLoss = 0;
    for (const g of greeks) {
      if (g.greeksAvailable) {
        const price = p.marketPrice ?? 0;
        stressLoss += stressTest(g, -0.10, price);
      }
    }

    const marketValue = Math.abs(p.marketValue ?? 0);
    const concentrationPct = totalPortfolioValue > 0 ? marketValue / totalPortfolioValue : 0;

    // Buying power estimate: stock = 50% margin, option short = 20% notional
    const bpUsage = p.assetType === "stock"
      ? marketValue * 0.5
      : p.assetType === "option" && p.quantity < 0
        ? (p.optionStrike ?? 0) * Math.abs(p.quantity) * 100 * 0.20
        : 0;

    const greekInfo = greekMap?.get(p.symbol);
    const oi = greekInfo?.openInterest ?? null;
    const vol = greekInfo?.volume ?? null;
    const spreadPct = greekInfo?.bid != null && greekInfo?.ask != null && greekInfo.ask > 0
      ? (greekInfo.ask - greekInfo.bid) / ((greekInfo.bid + greekInfo.ask) / 2)
      : null;

    // Max profit for short options
    let maxProfit: number | null = null;
    let profitPctCaptured: number | null = null;
    if (p.assetType === "option" && p.quantity < 0 && p.optionStrike != null) {
      // Short option: max profit is premium received
      const premiumReceived = Math.abs(p.avgCost ?? p.marketPrice ?? 0) * Math.abs(p.quantity) * 100;
      maxProfit = premiumReceived;
      const unrealized = p.unrealizedPnL ?? 0;
      if (premiumReceived > 0) {
        profitPctCaptured = Math.min(1, Math.max(0, unrealized / premiumReceived));
      }
    }

    return {
      position: p,
      greekDelta: totalGreekDelta,
      greekGamma: totalGreekGamma,
      greekTheta: totalGreekTheta,
      greekVega: totalGreekVega,
      concentrationPct,
      stressLoss,
      buyingPowerUsage: bpUsage,
      buyingPowerTotal: totalPortfolioValue,
      buyingPowerPct: totalPortfolioValue > 0 ? bpUsage / totalPortfolioValue : 0,
      hasGreeks,
      daysToExpiry: p.optionExpiry
        ? Math.ceil((new Date(p.optionExpiry).getTime() - Date.now()) / 86400000)
        : null,
      isShort: p.quantity < 0,
      isOption: p.assetType === "option",
      isItm: p.optionType && p.optionStrike && p.marketPrice
        ? p.optionType === "put" ? p.optionStrike > p.marketPrice : p.optionStrike < p.marketPrice
        : null,
      extrinsicEstimate: p.optionType && p.optionStrike && p.marketPrice
        ? p.optionType === "put"
          ? Math.max(0, p.marketPrice - p.optionStrike)
          : Math.max(0, p.optionStrike - p.marketPrice)
        : null,
      openInterest: oi,
      volume: vol,
      spreadPct,
      maxProfit,
      profitPctCaptured,
    };
  });
}

// ── Helpers ──

function snapshotFromState(s: PositionState): RiskSnapshot {
  return {
    delta: s.greekDelta,
    gamma: s.greekGamma,
    theta: s.greekTheta,
    vega: s.greekVega,
    stressLoss10Pct: s.stressLoss,
    concentrationPct: s.concentrationPct,
  };
}

function classifyLiquidity(s: PositionState): Opportunity["liquidity"] {
  if (s.volume == null || s.openInterest == null) return "unknown";
  if (s.volume > 1000 && s.openInterest > 1000) return "good";
  if (s.volume > 100 && s.openInterest > 100) return "adequate";
  return "poor";
}
