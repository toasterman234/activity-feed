import type { OptionRow } from "../../lib/market-lake";

export type TradeStructure = "stock" | "csp" | "covered_call";
export type FillAssumption = "bid" | "mid" | "custom";

export interface TradeInputs {
  structure: TradeStructure;
  spot: number;
  quantity: number;
  contract: OptionRow | null;
  fill: number;
}

export interface TradeRisk {
  maxProfit: number | null;
  maxLoss: number;
  breakeven: number;
  capitalAtRisk: number;
  netDelta: number;
  netGamma: number;
  netTheta: number;
  netVega: number;
}

export function contractFill(
  contract: OptionRow | null,
  assumption: FillAssumption,
  customFill: number,
): number {
  if (!contract) return 0;
  if (assumption === "custom") return Math.max(0, customFill);
  if (assumption === "mid") return Math.max(0, contract.mid ?? ((contract.bid ?? 0) + (contract.ask ?? 0)) / 2);
  return Math.max(0, contract.bid ?? 0);
}

export function selectTradeContracts(
  rows: OptionRow[],
  structure: TradeStructure,
  spot: number,
  targetDelta = 0.3,
): OptionRow[] {
  if (structure === "stock") return [];
  const side = structure === "csp" ? "put" : "call";
  const target = structure === "csp" ? -targetDelta : targetDelta;
  return rows
    .filter((row) => row.side === side && row.strike != null && (row.bid ?? 0) > 0)
    .filter((row) => structure === "csp" ? (row.strike ?? 0) <= spot : (row.strike ?? 0) >= spot)
    .sort((left, right) => {
      const deltaDistance = Math.abs((left.delta ?? target) - target) - Math.abs((right.delta ?? target) - target);
      if (deltaDistance !== 0) return deltaDistance;
      return (right.open_interest ?? 0) - (left.open_interest ?? 0);
    })
    .slice(0, 8);
}

export function analyzeTrade(inputs: TradeInputs): TradeRisk {
  const multiplier = 100 * Math.max(1, inputs.quantity);
  if (inputs.structure === "stock" || !inputs.contract?.strike) {
    return {
      maxProfit: null,
      maxLoss: inputs.spot * multiplier,
      breakeven: inputs.spot,
      capitalAtRisk: inputs.spot * multiplier,
      netDelta: multiplier,
      netGamma: 0,
      netTheta: 0,
      netVega: 0,
    };
  }

  const strike = inputs.contract.strike;
  const premium = inputs.fill * multiplier;
  const optionDelta = (inputs.contract.delta ?? 0) * multiplier;
  const optionGamma = (inputs.contract.gamma ?? 0) * multiplier;
  const optionTheta = (inputs.contract.theta ?? 0) * multiplier;
  const optionVega = (inputs.contract.vega ?? 0) * multiplier;

  if (inputs.structure === "csp") {
    return {
      maxProfit: premium,
      maxLoss: strike * multiplier - premium,
      breakeven: strike - inputs.fill,
      capitalAtRisk: strike * multiplier,
      netDelta: -optionDelta,
      netGamma: -optionGamma,
      netTheta: -optionTheta,
      netVega: -optionVega,
    };
  }

  return {
    maxProfit: (strike - inputs.spot + inputs.fill) * multiplier,
    maxLoss: (inputs.spot - inputs.fill) * multiplier,
    breakeven: inputs.spot - inputs.fill,
    capitalAtRisk: inputs.spot * multiplier,
    netDelta: multiplier - optionDelta,
    netGamma: -optionGamma,
    netTheta: -optionTheta,
    netVega: -optionVega,
  };
}

export function expirationPnL(inputs: TradeInputs, terminalPrice: number): number {
  const multiplier = 100 * Math.max(1, inputs.quantity);
  if (inputs.structure === "stock" || !inputs.contract?.strike) {
    return (terminalPrice - inputs.spot) * multiplier;
  }
  const optionIntrinsic = Math.max(
    inputs.structure === "csp"
      ? inputs.contract.strike - terminalPrice
      : terminalPrice - inputs.contract.strike,
    0,
  );
  const stockPnL = inputs.structure === "covered_call" ? (terminalPrice - inputs.spot) * multiplier : 0;
  return stockPnL + (inputs.fill - optionIntrinsic) * multiplier;
}

export function scenarioPnL(
  inputs: TradeInputs,
  priceChangePct: number,
  ivChangePoints: number,
  daysElapsed: number,
): number {
  const multiplier = 100 * Math.max(1, inputs.quantity);
  const priceChange = inputs.spot * priceChangePct;
  if (inputs.structure === "stock" || !inputs.contract) return priceChange * multiplier;

  const optionChange = (
    (inputs.contract.delta ?? 0) * priceChange
    + 0.5 * (inputs.contract.gamma ?? 0) * priceChange * priceChange
    + (inputs.contract.vega ?? 0) * ivChangePoints
    + (inputs.contract.theta ?? 0) * daysElapsed
  ) * multiplier;
  const stockChange = inputs.structure === "covered_call" ? priceChange * multiplier : 0;
  return stockChange - optionChange;
}

export function payoffSeries(inputs: TradeInputs, points = 17): Array<{ price: number; pnl: number }> {
  const risk = analyzeTrade(inputs);
  const center = inputs.contract?.strike ?? inputs.spot;
  const low = Math.max(0, Math.min(inputs.spot, center) * 0.65);
  const high = Math.max(inputs.spot, center) * 1.35;
  return Array.from({ length: points }, (_, index) => {
    const price = low + (high - low) * (index / (points - 1));
    return { price, pnl: expirationPnL(inputs, price) };
  }).concat([{ price: risk.breakeven, pnl: expirationPnL(inputs, risk.breakeven) }])
    .sort((left, right) => left.price - right.price);
}
