// ── Opportunity scoring engine ──
// Scores opportunities using configurable multi-component weights + penalty system.
// All scoring is deterministic — no LLM involved in calculation.

import type { Opportunity, ScoreBreakdown, PenaltyResult } from "./opportunity-types";

export interface ScoringWeights {
  expectedBenefit: number;
  riskAdjustedReturn: number;
  liquidity: number;
  portfolioFit: number;
  buyingPowerImpact: number;
  diversificationImprovement: number;
  timingUrgency: number;
  dataConfidence: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  expectedBenefit: 0.20,
  riskAdjustedReturn: 0.15,
  liquidity: 0.15,
  portfolioFit: 0.15,
  buyingPowerImpact: 0.10,
  diversificationImprovement: 0.10,
  timingUrgency: 0.10,
  dataConfidence: 0.05,
};

/**
 * Score a list of opportunities in-place (mutates score, scoreBreakdown fields).
 */
export function scoreOpportunities(
  opportunities: Opportunity[],
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
  maxConcentrationPct: number = 0.30,
  maxUndefinedPct: number = 0.10,
): void {
  for (const opp of opportunities) {
    const breakdown = computeScoreBreakdown(opp, weights, maxConcentrationPct, maxUndefinedPct);
    const rawScore = computeRawScore(breakdown, weights);
    const penaltyTotal = breakdown.penalties.reduce((s, p) => s + p.deduction, 0);
    const finalScore = Math.max(0, rawScore - penaltyTotal);

    opp.score = Math.min(1, finalScore);
    opp.scoreBreakdown = breakdown;
  }
}

/**
 * Sort opportunities by score descending.
 */
export function rankOpportunities(opportunities: Opportunity[]): Opportunity[] {
  return [...opportunities].sort((a, b) => b.score - a.score);
}

/**
 * Top N opportunities by score.
 */
export function topOpportunities(opportunities: Opportunity[], n: number = 5): Opportunity[] {
  return rankOpportunities(opportunities).slice(0, n);
}

function computeScoreBreakdown(
  opp: Opportunity,
  w: ScoringWeights,
  maxConcentrationPct: number,
  maxUndefinedPct: number,
): ScoreBreakdown {
  const penalties: PenaltyResult[] = [];

  // ── Component scores (0–1 each) ──

  // Expected benefit: scale credit/debit relative to position size
  const expectedBenefit = scoreExpectedBenefit(opp);

  // Risk-adjusted return
  const riskAdjustedReturn = scoreRiskAdjustedReturn(opp);

  // Liquidity
  const liquidity = scoreLiquidity(opp);

  // Portfolio fit
  const portfolioFit = scorePortfolioFit(opp);

  // Buying power impact
  const buyingPowerImpact = scoreBuyingPowerImpact(opp);

  // Diversification improvement
  const diversificationImprovement = scoreDiversification(opp);

  // Timing / urgency
  const timingUrgency = scoreTiming(opp);

  // Data confidence
  const dataConfidence = scoreConfidence(opp);

  // ── Penalties ──

  // Earnings risk penalty
  if (opp.eventRisk) {
    penalties.push({ reason: "Earnings before expiration", deduction: 0.15 });
  }

  // Poor liquidity penalty
  if (opp.liquidity === "poor") {
    penalties.push({ reason: "Poor liquidity", deduction: 0.10 });
  } else if (opp.liquidity === "unknown") {
    penalties.push({ reason: "Unknown liquidity", deduction: 0.05 });
  }

  // Excess concentration penalty
  if (opp.currentRisk.concentrationPct > maxConcentrationPct) {
    penalties.push({
      reason: `Concentration ${(opp.currentRisk.concentrationPct * 100).toFixed(0)}% > ${(maxConcentrationPct * 100).toFixed(0)}%`,
      deduction: Math.min(0.20, (opp.currentRisk.concentrationPct - maxConcentrationPct) * 0.5),
    });
  }

  // Undefined risk penalty
  if (opp.category === "risk_reduction" && opp.currentRisk.stressLoss10Pct > maxUndefinedPct) {
    penalties.push({
      reason: "Position has undefined-risk exposure",
      deduction: 0.10,
    });
  }

  // Blocking reasons → severe penalty
  if (opp.blockingReasons.length > 0) {
    penalties.push({
      reason: `Blocked: ${opp.blockingReasons.join("; ")}`,
      deduction: 0.50,
    });
  }

  // Missing market data penalty
  if (opp.liquidity === "unknown" && !opp.currentRisk.delta) {
    penalties.push({ reason: "Missing market data", deduction: 0.10 });
  }

  return {
    expectedBenefit,
    riskAdjustedReturn,
    liquidity,
    portfolioFit,
    buyingPowerImpact,
    diversificationImprovement,
    timingUrgency,
    dataConfidence,
    penalties,
  };
}

function computeRawScore(b: ScoreBreakdown, w: ScoringWeights): number {
  return (
    b.expectedBenefit * w.expectedBenefit +
    b.riskAdjustedReturn * w.riskAdjustedReturn +
    b.liquidity * w.liquidity +
    b.portfolioFit * w.portfolioFit +
    b.buyingPowerImpact * w.buyingPowerImpact +
    b.diversificationImprovement * w.diversificationImprovement +
    b.timingUrgency * w.timingUrgency +
    b.dataConfidence * w.dataConfidence
  );
}

// ── Individual component scorers ──

function scoreExpectedBenefit(opp: Opportunity): number {
  // Credit is positive benefit; debit is negative but may still be worthwhile
  const credit = opp.estimatedCredit ?? 0;
  const capitalReleased = opp.capitalReleased ?? 0;
  const totalBenefit = credit + capitalReleased * 0.02; // 2% annualized capital release

  if (totalBenefit <= 0) return 0.2; // neutral — still might be worth it for risk reasons
  if (totalBenefit > 500) return 1;
  if (totalBenefit > 100) return 0.7;
  if (totalBenefit > 25) return 0.5;
  return 0.3;
}

function scoreRiskAdjustedReturn(opp: Opportunity): number {
  const credit = opp.estimatedCredit ?? 0;
  const stressLoss = Math.abs(opp.currentRisk.stressLoss10Pct);
  if (credit <= 0) return 0.2;

  // Simple risk-adjusted: credit / stressLoss
  if (stressLoss === 0) return 0.5;
  const ratio = credit / stressLoss;
  if (ratio > 5) return 1;
  if (ratio > 2) return 0.7;
  if (ratio > 0.5) return 0.5;
  return 0.3;
}

function scoreLiquidity(opp: Opportunity): number {
  switch (opp.liquidity) {
    case "good": return 1;
    case "adequate": return 0.7;
    case "poor": return 0.3;
    case "unknown": return 0.4;
  }
}

function scorePortfolioFit(opp: Opportunity): number {
  // Does the action align with managing risk or enhancing income?
  switch (opp.category) {
    case "risk_reduction":
    case "concentration_reduction":
    case "buying_power_release":
      return 0.9;
    case "close_or_reduce":
      return 0.8;
    case "roll_candidate":
      return 0.7;
    case "income_enhancement":
      return 0.6;
    default:
      return 0.5;
  }
}

function scoreBuyingPowerImpact(opp: Opportunity): number {
  if (opp.capitalReleased != null && opp.capitalReleased > 0) return 1;
  if (opp.estimatedCredit != null && opp.estimatedCredit > 0) return 0.7;
  if (opp.capitalRequired != null && opp.capitalRequired > 0) return 0.3;
  return 0.5;
}

function scoreDiversification(opp: Opportunity): number {
  // Reducing concentration = very good for diversification
  if (opp.category === "concentration_reduction") return 1;
  if (opp.category === "risk_reduction") return 0.8;
  // Closing a winner → reallocation improves diversification
  if (opp.category === "close_or_reduce") return 0.6;
  return 0.4;
}

function scoreTiming(opp: Opportunity): number {
  if (opp.daysToExpiration != null && opp.daysToExpiration <= 3) return 1;
  if (opp.daysToExpiration != null && opp.daysToExpiration <= 7) return 0.8;
  if (opp.daysToExpiration != null && opp.daysToExpiration <= 21) return 0.6;
  return 0.4;
}

function scoreConfidence(opp: Opportunity): number {
  switch (opp.confidence) {
    case "high": return 1;
    case "medium": return 0.7;
    case "low": return 0.3;
  }
}
