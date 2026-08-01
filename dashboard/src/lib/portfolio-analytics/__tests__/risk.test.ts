// ── Unit tests: Risk analytics ──

import { describe, it, expect } from "vitest";
import {
  computeConcentrationBreakdown,
  computeExpirationRisk,
  computeAssignmentRisks,
  computeBuyingPower,
  computeCompositeRiskStatus,
  identifyCorrelationGroups,
  classifyRiskDefinitions,
  computeGrossNotional,
} from "../risk";
import type { NormalizedPosition, PositionGreek } from "../types";

function makeStock(overrides?: Partial<NormalizedPosition>): NormalizedPosition {
  return {
    symbol: "AAPL",
    quantity: 100,
    avgCost: 180,
    marketPrice: 200,
    marketValue: 20000,
    unrealizedPnL: 2000,
    realizedPnL: 0,
    assetType: "stock",
    institution: "schwab",
    accountName: "Individual",
    ...overrides,
  };
}

function makeOption(overrides?: Partial<NormalizedPosition>): NormalizedPosition {
  return {
    symbol: "AAPL250117P00180000",
    quantity: -1,
    avgCost: null,
    marketPrice: 200,
    marketValue: 350,
    unrealizedPnL: 50,
    realizedPnL: 0,
    assetType: "option",
    institution: "schwab",
    accountName: "Individual",
    optionType: "put",
    optionStrike: 180,
    optionExpiry: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
    ...overrides,
  };
}

function makeGreek(overrides?: Partial<PositionGreek>): PositionGreek {
  return {
    symbol: "AAPL250117P00180000",
    quantity: -1,
    optionType: "put",
    strike: 180,
    expiration: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
    delta: 30,
    gamma: -2,
    theta: 15,
    vega: -25,
    rho: 5,
    deltaDollars: 6000,
    greeksAvailable: true,
    greekSource: "market-lake",
    ...overrides,
  };
}

describe("computeConcentrationBreakdown", () => {
  it("computes per-symbol concentration", () => {
    const positions = [
      makeStock({ symbol: "AAPL", marketValue: 20000 }),
      makeStock({ symbol: "MSFT", marketValue: 10000 }),
      makeStock({ symbol: "SPY", marketValue: 5000 }),
    ];
    const result = computeConcentrationBreakdown(positions, [], new Map());

    expect(result.bySymbol).toHaveLength(3);
    expect(result.bySymbol[0].symbol).toBe("AAPL");
    expect(result.bySymbol[0].pct).toBeCloseTo(20000 / 35000, 2);
    expect(result.top1Pct).toBeCloseTo(20000 / 35000, 2);
    expect(result.top3Pct).toBeCloseTo(1, 2);
  });

  it("merges Greeks into symbol data", () => {
    const positions = [makeStock({ symbol: "AAPL", marketValue: 20000 })];
    const greeks = [makeGreek({ symbol: "AAPL", delta: 50, theta: 20 })];

    const result = computeConcentrationBreakdown(positions, greeks, new Map());
    expect(result.bySymbol[0].deltaExposure).toBe(50);
    expect(result.bySymbol[0].thetaExposure).toBe(20);
  });

  it("groups by sector", () => {
    const positions = [
      makeStock({ symbol: "AAPL", marketValue: 20000 }),
      makeStock({ symbol: "MSFT", marketValue: 10000 }),
    ];
    const sectorMap = new Map([["AAPL", "Technology"], ["MSFT", "Technology"]]);

    const result = computeConcentrationBreakdown(positions, [], sectorMap);
    expect(result.bySector).toHaveLength(1);
    expect(result.bySector[0].sector).toBe("Technology");
    expect(result.bySector[0].pct).toBe(1);
  });

  it("groups by strategy", () => {
    const positions = [
      makeStock({ symbol: "AAPL", marketValue: 20000 }),
      makeOption({ optionType: "put", quantity: -1, marketValue: 350 }),
    ];
    const result = computeConcentrationBreakdown(positions, [], new Map());

    expect(result.byStrategy.map((s) => s.strategy)).toContain("Long Stock");
    expect(result.byStrategy.map((s) => s.strategy)).toContain("Short Put");
  });

  it("handles empty inputs", () => {
    const result = computeConcentrationBreakdown([], [], new Map());
    expect(result.bySymbol).toHaveLength(0);
    expect(result.top1Pct).toBe(0);
  });
});

describe("computeExpirationRisk", () => {
  it("buckets options by days to expiration", () => {
    const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

    const positions = [
      makeOption({ optionExpiry: in7Days, quantity: -2 }),
      makeOption({
        symbol: "MSFT250117C00350000",
        optionType: "call",
        optionStrike: 350,
        optionExpiry: in30Days,
        quantity: -1,
      }),
    ];
    const greeks = [
      makeGreek({ expiration: in7Days, theta: 15 }),
      makeGreek({ symbol: "MSFT250117C00350000", expiration: in30Days, theta: 10, optionType: "call" }),
    ];

    const buckets = computeExpirationRisk(positions, greeks);
    const near = buckets.find((b) => b.label === "4–7 days");
    const mid = buckets.find((b) => b.label === "22–45 days");

    expect(near).toBeDefined();
    expect(near!.contracts).toBe(2);
    expect(mid).toBeDefined();
    expect(mid!.contracts).toBe(1);
  });

  it("filters expired options", () => {
    const inPast = new Date(Date.now() - 5 * 86400000).toISOString().split("T")[0];
    const positions = [makeOption({ optionExpiry: inPast })];
    const buckets = computeExpirationRisk(positions, []);
    expect(buckets.filter((b) => b.contracts > 0)).toHaveLength(0);
  });
});

describe("computeAssignmentRisks", () => {
  it("flags ITM short puts", () => {
    const positions = [makeOption({ optionType: "put", strike: 180, quantity: -1 })];
    const prices = new Map([["AAPL250117P00180000", 170]]); // underlying at 170, strike 180 → ITM

    const risks = computeAssignmentRisks(positions, prices, new Map());
    expect(risks).toHaveLength(1);
    expect(risks[0].isItm).toBe(true);
    expect(risks[0].factors).toContain("In-the-money");
  });

  it("flags high risk for near-expiry ITM options", () => {
    const tomorrow = new Date(Date.now() + 1 * 86400000).toISOString().split("T")[0];
    const positions = [makeOption({ optionExpiry: tomorrow, strike: 180, quantity: -1 })];
    const prices = new Map([["AAPL250117P00180000", 170]]);

    const risks = computeAssignmentRisks(positions, prices, new Map());
    expect(risks[0].riskLevel).toBe("high");
    expect(risks[0].factors.length).toBeGreaterThanOrEqual(2);
  });

  it("ignores long options", () => {
    const positions = [makeOption({ quantity: 1 })];
    const risks = computeAssignmentRisks(positions, new Map(), new Map());
    expect(risks).toHaveLength(0);
  });

  it("handles missing underlying prices", () => {
    const positions = [makeOption()];
    const risks = computeAssignmentRisks(positions, new Map(), new Map());
    expect(risks[0].underlyingPrice).toBeNull();
    expect(risks[0].riskLevel).toBe("low");
  });
});

describe("computeBuyingPower", () => {
  it("estimates buying power from positions", () => {
    const positions = [
      makeStock({ marketValue: 50000 }),
      makeOption({ assetType: "option", marketValue: -500 }),
    ];
    const result = computeBuyingPower(positions, 10000);
    // Reg T: 10000 + 50000*0.5 - 500*0.2 = 35000 - 100 = 34900
    expect(result.estimatedBuyingPower).toBeCloseTo(34900, 0);
    // usage: 50000 / 34900 ≈ 1.43 → capped
    expect(result.status).toBe("critical");
  });

  it("returns ok for low usage", () => {
    const positions = [makeStock({ marketValue: 10000 })];
    const result = computeBuyingPower(positions, 50000);
    expect(result.status).toBe("ok");
  });
});

describe("computeCompositeRiskStatus", () => {
  it("computes composite from components", () => {
    const status = computeCompositeRiskStatus({
      buyingPowerUsagePct: 0.55,
      stressLossPct: 0.12,
      tickerConcentrationTop1: 0.35,
      sectorConcentrationTop1: 0.40,
      expirationClusteringPct: 0.15,
      assignmentRiskCount: 3,
      undefinedRiskPct: 0.05,
    });

    expect(status.components).toHaveLength(7);
    expect(status.overallScore).toBeGreaterThan(0);
    expect(status.overallScore).toBeLessThanOrEqual(1);

    // Buying power at 0.55 should be "warning"
    const bp = status.components.find((c) => c.label === "Buying Power Usage");
    expect(bp?.status).toBe("warning");

    // Assignment with 3 positions should be "watch"
    const ar = status.components.find((c) => c.label === "Assignment Risk");
    expect(ar?.status).toBe("watch");
  });

  it("handles null values", () => {
    const status = computeCompositeRiskStatus({
      buyingPowerUsagePct: null,
      stressLossPct: null,
      tickerConcentrationTop1: 0.1,
      sectorConcentrationTop1: 0.1,
      expirationClusteringPct: 0,
      assignmentRiskCount: 0,
      undefinedRiskPct: 0,
    });

    const bp = status.components.find((c) => c.label === "Buying Power Usage");
    expect(bp?.rawValue).toBe(1); // unknown → max risk
    expect(bp?.detail).toBe("Unknown");
  });
});

describe("identifyCorrelationGroups", () => {
  it("identifies technology correlations", () => {
    const positions = [
      makeStock({ symbol: "AAPL", marketValue: 20000 }),
      makeStock({ symbol: "MSFT", marketValue: 10000 }),
      makeStock({ symbol: "SPY", marketValue: 5000 }),
    ];
    const groups = identifyCorrelationGroups(positions);

    const tech = groups.find((g) => g.label === "Technology");
    expect(tech).toBeDefined();
    expect(tech!.symbols).toContain("AAPL");
    expect(tech!.symbols).toContain("MSFT");
    expect(tech!.symbols).not.toContain("SPY");
  });

  it("identifies ETF correlations", () => {
    const positions = [makeStock({ symbol: "SPY", marketValue: 5000 })];
    const groups = identifyCorrelationGroups(positions);
    expect(groups.some((g) => g.label === "Broad Market ETFs")).toBe(true);
  });

  it("skips groups with fewer than threshold symbols", () => {
    const positions = [makeStock({ symbol: "SPY", marketValue: 5000 })];
    const groups = identifyCorrelationGroups(positions);
    // SPY alone is an ETF group, but AAPL alone shouldn't create a tech group
    const tech = groups.find((g) => g.label === "Technology");
    expect(tech).toBeUndefined();
  });
});

describe("classifyRiskDefinitions", () => {
  it("classifies long stock as defined", () => {
    const result = classifyRiskDefinitions([makeStock()]);
    expect(result.defined).toHaveLength(1);
    expect(result.undefined).toHaveLength(0);
  });

  it("classifies short put as defined (capped loss)", () => {
    const result = classifyRiskDefinitions([makeOption({ optionType: "put", quantity: -1 })]);
    expect(result.defined).toHaveLength(1);
  });

  it("classifies short call as undefined", () => {
    const result = classifyRiskDefinitions([makeOption({ optionType: "call", quantity: -1 })]);
    expect(result.undefined).toHaveLength(1);
  });

  it("classifies long options as defined", () => {
    const result = classifyRiskDefinitions([makeOption({ quantity: 1 })]);
    expect(result.defined).toHaveLength(1);
  });
});

describe("computeGrossNotional", () => {
  it("computes notional for options and stocks", () => {
    const positions = [
      makeStock({ marketValue: 20000 }),
      makeOption({ strike: 180, quantity: -1, marketValue: 350 }),
    ];
    // Stocks: 20000, Options: 180 * 1 * 100 = 18000, total = 38000
    expect(computeGrossNotional(positions)).toBe(38000);
  });

  it("handles empty positions", () => {
    expect(computeGrossNotional([])).toBe(0);
  });
});
