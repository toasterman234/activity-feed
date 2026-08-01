// ── Unit tests: Scenario engine ──

import { describe, it, expect } from "vitest";
import {
  estimateScenarioPnL,
  runStressTest,
  worstScenario,
  symbolDownScenario,
} from "../scenarios";
import type { PositionGreek } from "../types";

function makePositionGreek(overrides?: Partial<PositionGreek>): PositionGreek {
  return {
    symbol: "AAPL",
    quantity: -1,
    optionType: "put",
    strike: 180,
    expiration: "2025-01-17",
    delta: 30, // short put = positive delta (30 shares equivalent)
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

describe("estimateScenarioPnL", () => {
  it("estimates P&L for a price drop", () => {
    const g = makePositionGreek();
    // Price drops 10% from $200 -> -$20
    // delta: 30 × (-20) = -600
    // gamma: -2 × 0.5 × (-20)² = -2 × 0.5 × 400 = -400
    // Total: -1000
    const pnl = estimateScenarioPnL(g, -0.10, 200, 0, 0);
    expect(pnl).toBeCloseTo(-1000, 0);
  });

  it("estimates P&L for IV increase", () => {
    const g = makePositionGreek();
    // IV +10 points
    // vega: -25 × 10 = -250
    const pnl = estimateScenarioPnL(g, 0, 200, 10, 0);
    expect(pnl).toBeCloseTo(-250, 0);
  });

  it("estimates P&L for time decay (theta)", () => {
    const g = makePositionGreek();
    // 1 day passes
    // theta: 15 × 1 = 15
    const pnl = estimateScenarioPnL(g, 0, 200, 0, 1);
    expect(pnl).toBeCloseTo(15, 0);
  });

  it("estimates combined scenario", () => {
    const g = makePositionGreek();
    // Market -10%, IV +10, 1 day
    const pnl = estimateScenarioPnL(g, -0.10, 200, 10, 1);

    // delta: 30 × (-20) = -600
    // gamma: -2 × 0.5 × 400 = -400
    // vega: -25 × 10 = -250
    // theta: 15 × 1 = 15
    // total: -1235
    expect(pnl).toBeCloseTo(-1235, 0);
  });

  it("handles zero Greeks", () => {
    const g = makePositionGreek({ delta: 0, gamma: 0, theta: 0, vega: 0 });
    expect(estimateScenarioPnL(g, -0.10, 200, 5, 3)).toBe(0);
  });

  it("skips positions without Greeks", () => {
    const g = makePositionGreek({ greeksAvailable: false, delta: 0, theta: 0, vega: 0, gamma: 0 });
    expect(estimateScenarioPnL(g, -0.20, 200, 10, 7)).toBe(0);
  });
});

describe("runStressTest", () => {
  it("generates all scenario categories", () => {
    const g = makePositionGreek();
    const prices = new Map([["AAPL", 200]]);
    const grid = runStressTest([g], prices, 50000, "2025-01-15");

    // 6 price shocks + 4 vol changes + 3 time steps + 3 combined = 16
    expect(grid.scenarios.length).toBe(16);
    expect(grid.portfolioValue).toBe(50000);
    expect(grid.approximationMethod).toBe("delta-gamma");

    // Verify worst scenario is the big drop
    const labels = grid.scenarios.map((s) => s.label);
    expect(labels).toContain("Price -20%");
    expect(labels).toContain("Market -10%, IV +10");

    // Time decay should be positive for short option positions
    const timeScenario = grid.scenarios.find((s) => s.label === "1 day pass");
    expect(timeScenario?.estimatedPnL).toBeGreaterThan(0);
  });

  it("sorts scenarios from worst to best P&L", () => {
    const g = makePositionGreek();
    const grid = runStressTest([g], new Map([["AAPL", 200]]), 50000, "now");
    for (let i = 1; i < grid.scenarios.length; i++) {
      expect(grid.scenarios[i].estimatedPnL).toBeGreaterThanOrEqual(
        grid.scenarios[i - 1].estimatedPnL,
      );
    }
  });
});

describe("worstScenario", () => {
  it("returns the scenario with lowest P&L", () => {
    const g = makePositionGreek();
    const grid = runStressTest([g], new Map([["AAPL", 200]]), 50000, "now");
    const worst = worstScenario(grid);
    expect(worst).not.toBeNull();
    // Worst should be a large price drop
    expect(worst!.label).toContain("-20%");
  });

  it("returns null for empty grid", () => {
    expect(worstScenario({ asOf: "now", portfolioValue: 100, scenarios: [], approximationMethod: "delta-gamma" })).toBeNull();
  });
});

describe("symbolDownScenario", () => {
  it("estimates loss for a specific symbol drop", () => {
    const g = makePositionGreek({ symbol: "AAPL" });
    const result = symbolDownScenario(
      [g],
      new Map([["AAPL", 200]]),
      50000,
      "AAPL",
      0.20,
    );

    expect(result).not.toBeNull();
    expect(result!.label).toBe("AAPL down 20%");
    expect(result!.estimatedPnL).toBeLessThan(0); // should lose money
  });

  it("returns null for unknown symbol", () => {
    const g = makePositionGreek({ symbol: "AAPL" });
    const result = symbolDownScenario(
      [g],
      new Map([["AAPL", 200]]),
      50000,
      "MSFT",
      0.20,
    );
    expect(result).toBeNull();
  });
});
