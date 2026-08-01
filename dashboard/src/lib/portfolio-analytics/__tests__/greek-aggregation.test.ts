// ── Unit tests: Greek aggregation ──

import { describe, it, expect } from "vitest";
import { aggregateGreeks, toGreekSnapshot } from "../greek-aggregation";
import type { NormalizedPosition, OptionGreekSnapshot } from "../types";

function stockPosition(overrides?: Partial<NormalizedPosition>): NormalizedPosition {
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

function shortPutPosition(overrides?: Partial<NormalizedPosition>): NormalizedPosition {
  return {
    symbol: "AAPL250117P00180000",
    quantity: -1, // short
    avgCost: null,
    marketPrice: 200,
    marketValue: null,
    unrealizedPnL: 150,
    realizedPnL: 0,
    assetType: "option",
    institution: "schwab",
    accountName: "Individual",
    optionType: "put",
    optionStrike: 180,
    optionExpiry: "2025-01-17",
    ...overrides,
  };
}

function makeGreekSnapshot(overrides?: Partial<OptionGreekSnapshot>): OptionGreekSnapshot {
  return {
    symbol: "AAPL250117P00180000",
    side: "put",
    strike: 180,
    expiration: "2025-01-17",
    delta: -0.30,
    gamma: 0.02,
    theta: -0.15,
    vega: 0.25,
    rho: -0.05,
    impliedVolatility: 0.25,
    bid: 3.50,
    ask: 3.70,
    mid: 3.60,
    volume: 500,
    openInterest: 2000,
    timestamp: "2025-01-15T12:00:00Z",
    ...overrides,
  };
}

describe("aggregateGreeks", () => {
  it("handles empty inputs", () => {
    const result = aggregateGreeks([], new Map(), "2025-01-01");
    expect(result.netDelta).toBe(0);
    expect(result.netGamma).toBe(0);
    expect(result.netTheta).toBe(0);
    expect(result.netVega).toBe(0);
    expect(result.positionGreeks).toHaveLength(0);
  });

  it("computes delta for stock positions", () => {
    const pos = stockPosition({ quantity: 100 });
    const result = aggregateGreeks([pos], new Map(), "2025-01-01");
    expect(result.netDelta).toBe(100);
    expect(result.netDeltaDollars).toBe(20000); // 100 shares × $200
    expect(result.netGamma).toBe(0);
    expect(result.netTheta).toBe(0);
  });

  it("computes signed Greeks for short put (negative quantity)", () => {
    const pos = shortPutPosition();
    const greeks = makeGreekSnapshot();
    const greekMap = new Map([[pos.symbol, greeks]]);

    const result = aggregateGreeks([pos], greekMap, "2025-01-01");

    // Short 1 put: contract Greek × qty (-1) × 100
    // delta: -0.30 × -1 × 100 = +30
    expect(result.netDelta).toBeCloseTo(30, 1);
    // gamma: 0.02 × -1 × 100 = -2
    expect(result.netGamma).toBeCloseTo(-2, 1);
    // theta: -0.15 × -1 × 100 = +15
    expect(result.netTheta).toBeCloseTo(15, 1);
    // vega: 0.25 × -1 × 100 = -25
    expect(result.netVega).toBeCloseTo(-25, 1);
  });

  it("computes signed Greeks for long call (positive quantity)", () => {
    const pos: NormalizedPosition = {
      ...shortPutPosition(),
      quantity: 2, // long 2 calls
      optionType: "call",
    };
    const greeks = makeGreekSnapshot({
      side: "call",
      delta: 0.65,
      theta: -0.22,
      gamma: 0.03,
      vega: 0.30,
    });
    const greekMap = new Map([[pos.symbol, greeks]]);

    const result = aggregateGreeks([pos], greekMap, "2025-01-01");

    // Long 2 calls: contract Greek × 2 × 100
    expect(result.netDelta).toBeCloseTo(0.65 * 2 * 100, 1); // 130
    expect(result.netTheta).toBeCloseTo(-0.22 * 2 * 100, 1); // -44
    expect(result.netGamma).toBeCloseTo(0.03 * 2 * 100, 1); // 6
  });

  it("marks positions without Greeks", () => {
    const pos = shortPutPosition();
    const result = aggregateGreeks([pos], new Map(), "2025-01-01");

    expect(result.positionsWithoutGreeks).toContain(pos.symbol);
    expect(result.positionGreeks).toHaveLength(1);
    expect(result.positionGreeks[0].greeksAvailable).toBe(false);
    expect(result.positionGreeks[0].greekSource).toBe("unavailable");
  });

  it("aggregates mixed stock and option positions", () => {
    const stock = stockPosition({ symbol: "AAPL", quantity: 50, marketPrice: 200 });
    const opt = shortPutPosition({ symbol: "SPX250117P04500000", quantity: -2 });
    const greeks = makeGreekSnapshot({
      symbol: "SPX250117P04500000",
      delta: -0.40,
      theta: -0.18,
      gamma: 0.01,
      vega: 0.20,
    });
    const greekMap = new Map([[opt.symbol, greeks]]);

    const result = aggregateGreeks([stock, opt], greekMap, "2025-01-01");

    // Stock: +50 delta
    // Short 2 puts: -0.40 × -2 × 100 = +80 delta
    expect(result.netDelta).toBeCloseTo(130, 1);
    // Theta: -0.18 × -2 × 100 = +36
    expect(result.netTheta).toBeCloseTo(36, 1);
    expect(result.positionGreeks).toHaveLength(2);
  });

  it("handles null Greek values gracefully", () => {
    const pos = shortPutPosition();
    const greeks = makeGreekSnapshot({
      delta: null,
      gamma: null,
      theta: null,
      vega: null,
    });
    const result = aggregateGreeks([pos], new Map([[pos.symbol, greeks]]), "2025-01-01");

    expect(result.netDelta).toBe(0);
    expect(result.netTheta).toBe(0);
    expect(result.positionsWithoutGreeks).toHaveLength(1);
  });
});

describe("toGreekSnapshot", () => {
  it("converts an OptionRow-like object", () => {
    const row = {
      strike: 180,
      delta: 0.45,
      gamma: 0.02,
      theta: -0.15,
      vega: 0.22,
      rho: 0.08,
      implied_volatility: 0.30,
      bid: 5.10,
      ask: 5.30,
      mid: 5.20,
      volume: 1200,
      open_interest: 4500,
      timestamp: "2025-01-15T12:00:00Z",
    };

    const snapshot = toGreekSnapshot("AAPL250117C00180000", "call", row);

    expect(snapshot.symbol).toBe("AAPL250117C00180000");
    expect(snapshot.side).toBe("call");
    expect(snapshot.delta).toBe(0.45);
    expect(snapshot.theta).toBe(-0.15);
    expect(snapshot.impliedVolatility).toBe(0.30);
  });

  it("handles null fields", () => {
    const row = {};
    const snapshot = toGreekSnapshot("FOO", "put", row);
    expect(snapshot.delta).toBeNull();
    expect(snapshot.gamma).toBeNull();
    expect(snapshot.theta).toBeNull();
    expect(snapshot.strike).toBeNull();
  });
});
