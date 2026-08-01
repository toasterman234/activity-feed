// ── Portfolio Analytics public API ──
// Barrel export. Import from "@/lib/portfolio-analytics" in components.

export type {
  NormalizedPosition,
  NormalizedTrade,
  OptionGreekSnapshot,
  PositionGreek,
  AggregatedGreeks,
  IncomeMetrics,
  IncomeBreakdown,
  IncomeSource,
  ThetaBySymbol,
  IncomeForecast,
  ScenarioResult,
  StressTestGrid,
  MetricCard,
  MetricCardStatus,
  DataQuality,
  MetricCardContributor,
} from "./types";

export type {
  Opportunity,
  OpportunityCategory,
  OpportunityConfig,
  PositionState,
  RiskSnapshot,
  ScoreBreakdown,
  PenaltyResult,
} from "./opportunity-types";

export { DEFAULT_OPPORTUNITY_CONFIG, OPPORTUNITY_LABELS } from "./opportunity-types";

export {
  aggregateGreeks,
  toGreekSnapshot,
} from "./greek-aggregation";

export {
  computeIncomeMetrics,
  computeRealizedPnL,
  computePremiumCashFlow,
  computeEstimatedCapital,
  computeThetaConcentration,
  computeIncomeStability,
  classifyIncomeSources,
  computeThetaBySymbol,
  generateIncomeForecast,
} from "./income";

export {
  estimateScenarioPnL,
  runStressTest,
  worstScenario,
  symbolDownScenario,
} from "./scenarios";

export {
  computeConcentrationBreakdown,
  computeExpirationRisk,
  computeAssignmentRisks,
  computeBuyingPower,
  computeCompositeRiskStatus,
  identifyCorrelationGroups,
  classifyRiskDefinitions,
  computeGrossNotional,
} from "./risk";

export type {
  ConcentrationBreakdown,
  ExpirationBucket,
  AssignmentRisk,
  BuyingPowerAnalysis,
  RiskComponentScore,
  CompositeRiskStatus,
  CorrelationGroup,
} from "./risk";

export {
  formatCurrency,
  formatPercent,
  formatNumber,
  buildCard,
  buildContributor,
  statusFromValue,
  dataQualityFromGreeks,
  changeAmount,
  changePercent,
} from "./metric-card";

// ── Opportunity engine & scoring ──

export {
  generateOpportunities,
  buildPositionStates,
} from "./opportunity-engine";

export {
  scoreOpportunities,
  rankOpportunities,
  topOpportunities,
} from "./opportunity-scoring";

export type { ScoringWeights } from "./opportunity-scoring";
