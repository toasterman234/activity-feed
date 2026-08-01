// ── Risk analytics ──
// Risk calculations: concentration, expiration clustering, composite status,
// buying-power analysis. All functions pure and deterministic.

import type {
  NormalizedPosition,
  NormalizedTrade,
  AggregatedGreeks,
  PositionGreek,
} from "./types";

// ── Concentration ──

export interface ConcentrationBreakdown {
  bySymbol: Array<{ symbol: string; marketValue: number; pct: number; deltaExposure: number; thetaExposure: number }>;
  bySector: Array<{ sector: string; marketValue: number; pct: number; symbolCount: number }>;
  byStrategy: Array<{ strategy: string; marketValue: number; pct: number; positionCount: number }>;
  top1Pct: number;
  top3Pct: number;
  top5Pct: number;
}

export function computeConcentrationBreakdown(
  positions: NormalizedPosition[],
  positionGreeks: PositionGreek[],
  sectorMap: Map<string, string>, // symbol -> sector
): ConcentrationBreakdown {
  const totalValue = positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  if (totalValue === 0) {
    return {
      bySymbol: [], bySector: [], byStrategy: [],
      top1Pct: 0, top3Pct: 0, top5Pct: 0,
    };
  }

  // By symbol
  const bySym = new Map<string, { marketValue: number; deltaExposure: number; thetaExposure: number }>();
  for (const p of positions) {
    const sym = p.symbol;
    const existing = bySym.get(sym);
    if (!existing) {
      bySym.set(sym, {
        marketValue: p.marketValue ?? 0,
        deltaExposure: 0,
        thetaExposure: 0,
      });
    } else {
      existing.marketValue += p.marketValue ?? 0;
    }
  }
  for (const g of positionGreeks) {
    const existing = bySym.get(g.symbol);
    if (existing) {
      existing.deltaExposure += g.delta;
      existing.thetaExposure += g.theta;
    }
  }

  const bySymbol = [...bySym.entries()]
    .map(([symbol, data]) => ({
      symbol,
      marketValue: data.marketValue,
      pct: data.marketValue / totalValue,
      deltaExposure: data.deltaExposure,
      thetaExposure: data.thetaExposure,
    }))
    .sort((a, b) => b.pct - a.pct);

  const top1Pct = bySymbol.slice(0, 1).reduce((s, x) => s + x.pct, 0);
  const top3Pct = bySymbol.slice(0, 3).reduce((s, x) => s + x.pct, 0);
  const top5Pct = bySymbol.slice(0, 5).reduce((s, x) => s + x.pct, 0);

  // By sector
  const bySec = new Map<string, { marketValue: number; symbols: Set<string> }>();
  for (const p of positions) {
    const sector = sectorMap.get(p.symbol) ?? "Unknown";
    const existing = bySec.get(sector);
    if (!existing) {
      bySec.set(sector, { marketValue: p.marketValue ?? 0, symbols: new Set([p.symbol]) });
    } else {
      existing.marketValue += p.marketValue ?? 0;
      existing.symbols.add(p.symbol);
    }
  }

  const bySector = [...bySec.entries()]
    .map(([sector, data]) => ({
      sector,
      marketValue: data.marketValue,
      pct: data.marketValue / totalValue,
      symbolCount: data.symbols.size,
    }))
    .sort((a, b) => b.pct - a.pct);

  // By strategy
  const byStrat = new Map<string, { marketValue: number; count: number }>();
  for (const p of positions) {
    let strategy: string;
    if (p.assetType === "option" && p.optionType === "put") {
      strategy = p.quantity > 0 ? "Long Put" : "Short Put";
    } else if (p.assetType === "option" && p.optionType === "call") {
      strategy = p.quantity > 0 ? "Long Call" : "Covered Call";
    } else if (p.assetType === "stock") {
      strategy = "Long Stock";
    } else if (p.assetType === "crypto") {
      strategy = "Crypto";
    } else {
      strategy = "Other";
    }
    const existing = byStrat.get(strategy);
    if (!existing) {
      byStrat.set(strategy, { marketValue: p.marketValue ?? 0, count: 1 });
    } else {
      existing.marketValue += p.marketValue ?? 0;
      existing.count++;
    }
  }

  const byStrategy = [...byStrat.entries()]
    .map(([strategy, data]) => ({
      strategy,
      marketValue: data.marketValue,
      pct: data.marketValue / totalValue,
      positionCount: data.count,
    }))
    .sort((a, b) => b.pct - a.pct);

  return { bySymbol, bySector, byStrategy, top1Pct, top3Pct, top5Pct };
}

// ── Expiration risk ──

export interface ExpirationBucket {
  label: string;
  range: [number, number]; // days min/max
  contracts: number;
  notionalValue: number;
  thetaConcentration: number;
  symbols: string[];
}

export function computeExpirationRisk(
  positions: NormalizedPosition[],
  positionGreeks: PositionGreek[],
  referenceDate?: Date,
): ExpirationBucket[] {
  const now = referenceDate ?? new Date();
  const buckets: ExpirationBucket[] = [
    { label: "0–3 days", range: [0, 3], contracts: 0, notionalValue: 0, thetaConcentration: 0, symbols: [] },
    { label: "4–7 days", range: [4, 7], contracts: 0, notionalValue: 0, thetaConcentration: 0, symbols: [] },
    { label: "8–21 days", range: [8, 21], contracts: 0, notionalValue: 0, thetaConcentration: 0, symbols: [] },
    { label: "22–45 days", range: [22, 45], contracts: 0, notionalValue: 0, thetaConcentration: 0, symbols: [] },
    { label: "46–90 days", range: [46, 90], contracts: 0, notionalValue: 0, thetaConcentration: 0, symbols: [] },
    { label: "90+ days", range: [91, Infinity], contracts: 0, notionalValue: 0, thetaConcentration: 0, symbols: [] },
  ];

  const totalTheta = positionGreeks.reduce((sum, g) => sum + Math.abs(g.theta), 0);

  for (const p of positions) {
    if (p.assetType !== "option" || !p.optionExpiry) continue;
    const expiry = new Date(p.optionExpiry);
    if (Number.isNaN(expiry.getTime())) continue;
    const days = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
    if (days < 0) continue; // expired

    const bucket = buckets.find((b) => days >= b.range[0] && days <= b.range[1]);
    if (!bucket) continue;

    bucket.contracts += Math.abs(p.quantity);
    bucket.notionalValue += Math.abs(p.marketValue ?? 0);

    // Theta from matching position Greeks
    const matchingGreeks = positionGreeks.filter(
      (g) => g.symbol === p.symbol && g.expiration === p.optionExpiry,
    );
    bucket.thetaConcentration += matchingGreeks.reduce((s, g) => s + Math.abs(g.theta), 0);

    if (!bucket.symbols.includes(p.symbol)) {
      bucket.symbols.push(p.symbol);
    }
  }

  // Normalize theta concentration
  for (const b of buckets) {
    b.thetaConcentration = totalTheta > 0 ? b.thetaConcentration / totalTheta : 0;
  }

  return buckets.filter((b) => b.contracts > 0);
}

// ── Assignment risk ──

export interface AssignmentRisk {
  symbol: string;
  optionType: "call" | "put";
  strike: number;
  expiration: string;
  daysToExpiration: number;
  quantity: number; // negative = short
  underlyingPrice: number | null;
  distanceToStrike: number | null;
  distancePct: number | null;
  isItm: boolean;
  extrinsicValue: number | null;
  riskLevel: "low" | "medium" | "high";
  factors: string[];
}

export function computeAssignmentRisks(
  positions: NormalizedPosition[],
  underlyingPrices: Map<string, number>,
  optionExtrinsic: Map<string, number>, // position symbol → extrinsic value
  referenceDate?: Date,
): AssignmentRisk[] {
  const now = referenceDate ?? new Date();
  const results: AssignmentRisk[] = [];

  for (const p of positions) {
    if (p.assetType !== "option" || !p.optionType || !p.optionStrike || !p.optionExpiry) continue;
    if (p.quantity >= 0) continue; // only short options

    const expiry = new Date(p.optionExpiry);
    if (Number.isNaN(expiry.getTime())) continue;
    const daysToExpiry = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
    if (daysToExpiry < 0) continue;

    const underlying = underlyingPrices.get(p.symbol) ?? null;
    const distanceToStrike = underlying != null
      ? p.optionType === "put"
        ? p.optionStrike - underlying
        : underlying - p.optionStrike
      : null;
    const distancePct = underlying != null && distanceToStrike != null
      ? distanceToStrike / underlying
      : null;
    const isItm = distanceToStrike != null && distanceToStrike > 0;
    const extrinsic = optionExtrinsic.get(p.symbol) ?? null;

    const factors: string[] = [];
    let riskLevel: AssignmentRisk["riskLevel"] = "low";

    if (isItm) {
      factors.push("In-the-money");
      riskLevel = "medium";
    }
    if (daysToExpiry <= 3) {
      factors.push("Expiring within 3 days");
      riskLevel = "high";
    } else if (daysToExpiry <= 7) {
      factors.push("Expiring within 7 days");
      if (riskLevel === "medium") riskLevel = "high";
    }
    if (extrinsic != null && extrinsic < 0.05) {
      factors.push("Low extrinsic value (<$0.05)");
      riskLevel = "high";
    }
    if (isItm && daysToExpiry <= 1) {
      factors.push("ITM + 1 day to expiry — high assignment probability");
      riskLevel = "high";
    }

    results.push({
      symbol: p.symbol,
      optionType: p.optionType,
      strike: p.optionStrike,
      expiration: p.optionExpiry,
      daysToExpiration: daysToExpiry,
      quantity: p.quantity,
      underlyingPrice: underlying,
      distanceToStrike,
      distancePct,
      isItm,
      extrinsicValue: extrinsic,
      riskLevel,
      factors,
    });
  }

  return results.sort((a, b) => {
    const riskOrder = { high: 0, medium: 1, low: 2 };
    return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
  });
}

// ── Buying-power analysis ──

export interface BuyingPowerAnalysis {
  totalMarketValue: number;
  estimatedBuyingPower: number;
  usagePct: number | null;
  status: "ok" | "watch" | "warning" | "critical";
  availableEstimate: number | null;
}

export function computeBuyingPower(positions: NormalizedPosition[], totalCash: number | null): BuyingPowerAnalysis {
  const totalValue = positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  // Rough estimate: buying power = cash + 50% of stock value (Reg T approximation)
  const stockValue = positions
    .filter((p) => p.assetType === "stock")
    .reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  const optionValue = positions
    .filter((p) => p.assetType === "option")
    .reduce((sum, p) => sum + Math.abs(p.marketValue ?? 0), 0);

  const estimatedBP = (totalCash ?? 0) + stockValue * 0.5 - optionValue * 0.2;
  const usagePct = estimatedBP > 0 ? totalValue / estimatedBP : null;

  let status: BuyingPowerAnalysis["status"] = "ok";
  if (usagePct != null && usagePct > 0.9) status = "critical";
  else if (usagePct != null && usagePct > 0.75) status = "warning";
  else if (usagePct != null && usagePct > 0.6) status = "watch";

  return {
    totalMarketValue: totalValue,
    estimatedBuyingPower: estimatedBP,
    usagePct,
    status,
    availableEstimate: totalCash,
  };
}

// ── Composite risk status ──

export interface RiskComponentScore {
  label: string;
  weight: number; // 0–1
  rawValue: number; // 0–1 (0 = no risk, 1 = max risk)
  score: number; // weight × rawValue
  status: "ok" | "watch" | "warning" | "critical";
  detail: string;
}

export interface CompositeRiskStatus {
  overallScore: number; // 0–1
  overallStatus: "ok" | "watch" | "warning" | "critical";
  components: RiskComponentScore[];
  asOf: string;
}

export function computeCompositeRiskStatus(
  params: {
    buyingPowerUsagePct: number | null;
    stressLossPct: number | null;
    tickerConcentrationTop1: number;
    sectorConcentrationTop1: number;
    expirationClusteringPct: number;
    assignmentRiskCount: number;
    undefinedRiskPct: number;
  },
  weights?: Partial<{
    buyingPower: number;
    stressLoss: number;
    concentration: number;
    sector: number;
    expiration: number;
    assignment: number;
    undefinedRisk: number;
  }>,
): CompositeRiskStatus {
  const w = {
    buyingPower: weights?.buyingPower ?? 0.20,
    stressLoss: weights?.stressLoss ?? 0.20,
    concentration: weights?.concentration ?? 0.15,
    sector: weights?.sector ?? 0.10,
    expiration: weights?.expiration ?? 0.10,
    assignment: weights?.assignment ?? 0.10,
    undefinedRisk: weights?.undefinedRisk ?? 0.05,
  };

  const components: RiskComponentScore[] = [
    {
      label: "Buying Power Usage",
      weight: w.buyingPower,
      rawValue: params.buyingPowerUsagePct ?? 1,
      score: 0,
      status: "ok",
      detail: params.buyingPowerUsagePct != null
        ? `${(params.buyingPowerUsagePct * 100).toFixed(0)}% used`
        : "Unknown",
    },
    {
      label: "Downside Stress Loss",
      weight: w.stressLoss,
      rawValue: params.stressLossPct ?? 1,
      score: 0,
      status: "ok",
      detail: params.stressLossPct != null
        ? `${(params.stressLossPct * 100).toFixed(1)}% of portfolio`
        : "Unknown",
    },
    {
      label: "Ticker Concentration",
      weight: w.concentration,
      rawValue: params.tickerConcentrationTop1,
      score: 0,
      status: "ok",
      detail: `Top holding: ${(params.tickerConcentrationTop1 * 100).toFixed(0)}%`,
    },
    {
      label: "Sector Concentration",
      weight: w.sector,
      rawValue: params.sectorConcentrationTop1,
      score: 0,
      status: "ok",
      detail: `Top sector: ${(params.sectorConcentrationTop1 * 100).toFixed(0)}%`,
    },
    {
      label: "Expiration Clustering",
      weight: w.expiration,
      rawValue: params.expirationClusteringPct,
      score: 0,
      status: "ok",
      detail: `${(params.expirationClusteringPct * 100).toFixed(0)}% of theta in busiest week`,
    },
    {
      label: "Assignment Risk",
      weight: w.assignment,
      rawValue: params.assignmentRiskCount > 10 ? 1 : params.assignmentRiskCount / 10,
      score: 0,
      status: "ok",
      detail: `${params.assignmentRiskCount} positions flagged`,
    },
    {
      label: "Undefined Risk",
      weight: w.undefinedRisk,
      rawValue: params.undefinedRiskPct,
      score: 0,
      status: "ok",
      detail: `${(params.undefinedRiskPct * 100).toFixed(0)}% undefined risk`,
    },
  ];

  // Compute scores and statuses
  for (const c of components) {
    c.score = c.weight * c.rawValue;
    if (c.rawValue > 0.75) c.status = "critical";
    else if (c.rawValue > 0.5) c.status = "warning";
    else if (c.rawValue > 0.25) c.status = "watch";
    else c.status = "ok";
  }

  const overallScore = components.reduce((sum, c) => sum + c.score, 0);
  let overallStatus: CompositeRiskStatus["overallStatus"] = "ok";
  if (overallScore > 0.5) overallStatus = "critical";
  else if (overallScore > 0.3) overallStatus = "warning";
  else if (overallScore > 0.15) overallStatus = "watch";

  return {
    overallScore,
    overallStatus,
    components,
    asOf: new Date().toISOString(),
  };
}

// ── Correlation risk ──

export interface CorrelationGroup {
  label: string;
  symbols: string[];
  totalValue: number;
  totalPct: number;
  rationale: string;
}

export function identifyCorrelationGroups(
  positions: NormalizedPosition[],
): CorrelationGroup[] {
  const groups: CorrelationGroup[] = [];

  // Tech-heavy (simple keyword matching)
  const techKeywords = ["AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "NVDA", "AMD", "INTC",
    "CRM", "ADBE", "ORCL", "CSCO", "QCOM", "AVGO", "TSLA", "NFLX", "PYPL", "SQ", "SHOP", "SNOW"];
  const techPositions = positions.filter((p) => techKeywords.includes(p.symbol));
  if (techPositions.length >= 2) {
    const val = techPositions.reduce((s, p) => s + (p.marketValue ?? 0), 0);
    const total = positions.reduce((s, p) => s + (p.marketValue ?? 0), 0);
    groups.push({
      label: "Technology",
      symbols: techPositions.map((p) => p.symbol),
      totalValue: val,
      totalPct: total > 0 ? val / total : 0,
      rationale: "Large-cap US technology stocks with high pairwise correlation",
    });
  }

  // Index / ETF
  const etfPositions = positions.filter((p) =>
    ["SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "IVV"].includes(p.symbol));
  if (etfPositions.length >= 1) {
    const val = etfPositions.reduce((s, p) => s + (p.marketValue ?? 0), 0);
    const total = positions.reduce((s, p) => s + (p.marketValue ?? 0), 0);
    groups.push({
      label: "Broad Market ETFs",
      symbols: etfPositions.map((p) => p.symbol),
      totalValue: val,
      totalPct: total > 0 ? val / total : 0,
      rationale: "Broad market ETFs are highly correlated with overall market moves",
    });
  }

  return groups;
}

// ── Undefined-risk classification ──

export function classifyRiskDefinitions(
  positions: NormalizedPosition[],
): { defined: NormalizedPosition[]; undefined: NormalizedPosition[]; unknown: NormalizedPosition[] } {
  const defined: NormalizedPosition[] = [];
  const undefinedRisk: NormalizedPosition[] = [];
  const unknown: NormalizedPosition[] = [];

  for (const p of positions) {
    if (p.assetType === "option" && p.quantity < 0) {
      // Short option
      if (p.optionType === "put") {
        // Short put = defined risk (cash-secured or margin)
        defined.push(p);
      } else {
        // Short naked call = potentially undefined
        undefinedRisk.push(p);
      }
    } else if (p.assetType === "stock" || p.assetType === "crypto") {
      // Long stock = defined risk (can go to zero)
      defined.push(p);
    } else if (p.assetType === "option" && p.quantity > 0) {
      // Long option = defined risk (premium paid)
      defined.push(p);
    } else {
      unknown.push(p);
    }
  }

  return { defined, undefined: undefinedRisk, unknown };
}

// ── Gross notional exposure ──

export function computeGrossNotional(
  positions: NormalizedPosition[],
): number {
  return positions.reduce((sum, p) => {
    if (p.assetType === "option" && p.optionStrike) {
      // Notional = strike × |qty| × 100
      return sum + p.optionStrike * Math.abs(p.quantity) * 100;
    }
    return sum + Math.abs(p.marketValue ?? 0);
  }, 0);
}
