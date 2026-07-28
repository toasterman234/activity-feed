import type { PortfolioPosition } from "../../lib/market-lake";
import type { TradeInputs, TradeRisk } from "./trade-lab-model";

export interface PortfolioRiskSnapshot {
  portfolioValue: number;
  proposedCapital: number;
  proposedPct: number | null;
  currentSymbolValue: number;
  postSymbolValue: number;
  postSymbolPct: number | null;
  currentSectorValue: number;
  postSectorValue: number;
  postSectorPct: number | null;
  equityDeltaShares: number;
  postDeltaShares: number;
  betaWeightedExposure: number | null;
  downside10: number | null;
  warnings: string[];
}

export function portfolioRiskSnapshot(
  positions: PortfolioPosition[],
  symbol: string,
  sector: string | null,
  inputs: TradeInputs,
  risk: TradeRisk,
): PortfolioRiskSnapshot {
  const portfolioValue = positions.reduce((sum, row) => sum + Math.max(0, row.market_value || 0), 0);
  const currentSymbolValue = positions
    .filter((row) => row.symbol.toUpperCase() === symbol.toUpperCase())
    .reduce((sum, row) => sum + Math.max(0, row.market_value || 0), 0);
  const currentSectorValue = sector
    ? positions.filter((row) => row.sector === sector).reduce((sum, row) => sum + Math.max(0, row.market_value || 0), 0)
    : 0;
  const proposedCapital = risk.capitalAtRisk;
  const postValue = portfolioValue + proposedCapital;
  const postSymbolValue = currentSymbolValue + proposedCapital;
  const postSectorValue = currentSectorValue + proposedCapital;
  const equityDeltaShares = positions.reduce((sum, row) => sum + (row.units || 0), 0);
  const betaRows = positions.filter((row) => row.beta != null);
  const betaWeightedExposure = betaRows.length
    ? betaRows.reduce((sum, row) => sum + row.market_value * (row.beta ?? 0), 0)
    : null;
  const proposedDeltaDollars = risk.netDelta * inputs.spot;
  const downside10 = betaWeightedExposure == null ? null : -(betaWeightedExposure + proposedDeltaDollars) * 0.1;
  const proposedPct = portfolioValue ? proposedCapital / portfolioValue : null;
  const postSymbolPct = postValue ? postSymbolValue / postValue : null;
  const postSectorPct = sector && postValue ? postSectorValue / postValue : null;
  const warnings = [
    ...(proposedPct != null && proposedPct > 0.1 ? ["Proposed capital exceeds 10% of current portfolio value."] : []),
    ...(postSymbolPct != null && postSymbolPct > 0.15 ? ["Post-trade single-symbol exposure exceeds 15%."] : []),
    ...(postSectorPct != null && postSectorPct > 0.3 ? ["Post-trade sector exposure exceeds 30%."] : []),
    ...(positions.some((row) => row.beta == null) ? ["Stress estimate has incomplete beta coverage."] : []),
  ];
  return {
    portfolioValue, proposedCapital, proposedPct, currentSymbolValue, postSymbolValue, postSymbolPct,
    currentSectorValue, postSectorValue, postSectorPct, equityDeltaShares,
    postDeltaShares: equityDeltaShares + risk.netDelta, betaWeightedExposure, downside10, warnings,
  };
}
