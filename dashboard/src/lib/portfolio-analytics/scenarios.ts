// ── Scenario engine ──
// Stress-test and scenario analysis using delta-gamma-theta-vega approximation.
// Falls back to delta-only when gamma/vega are unavailable.

import type { ScenarioResult, StressTestGrid, PositionGreek } from "./types";

/**
 * Estimate P&L for a single position under a scenario using the
 * delta-gamma-theta-vega Taylor expansion:
 *
 *   ΔPnL ≈ delta × ΔS + ½ × gamma × (ΔS)² + vega × Δσ + theta × Δt
 *
 * All Greeks must be signed (short positions already negative).
 */
export function estimateScenarioPnL(
  positionGreek: PositionGreek,
  priceChangePct: number,
  underlyingPrice: number,
  ivChangePoints: number,
  daysElapsed: number,
): number {
  const priceChange = underlyingPrice * priceChangePct;

  // delta contribution
  const deltaPnL = positionGreek.delta * priceChange;

  // gamma contribution (½ × gamma × ΔS²)
  const gammaPnL = 0.5 * positionGreek.gamma * priceChange * priceChange;

  // vega contribution (vega × Δσ — note vega is already per 1% IV change)
  const vegaPnL = positionGreek.vega * ivChangePoints;

  // theta contribution (theta × elapsed days)
  const thetaPnL = positionGreek.theta * daysElapsed;

  return deltaPnL + gammaPnL + vegaPnL + thetaPnL;
}

/**
 * Run a full stress-test grid across all positions.
 */
export function runStressTest(
  positionGreeks: PositionGreek[],
  underlyingPrices: Map<string, number>,
  portfolioValue: number,
  asOf: string,
): StressTestGrid {
  const scenarios: ScenarioResult[] = [];

  // Price shocks
  const priceShocks = [-0.20, -0.10, -0.05, 0.05, 0.10, 0.20];
  for (const shock of priceShocks) {
    scenarios.push(
      runScenario(positionGreeks, underlyingPrices, portfolioValue, {
        label: `Price ${shock >= 0 ? "+" : ""}${(shock * 100).toFixed(0)}%`,
        priceChangePct: shock,
        ivChangePoints: 0,
        daysElapsed: 0,
      }),
    );
  }

  // Volatility changes
  const volChanges = [-10, -5, 5, 10];
  for (const iv of volChanges) {
    scenarios.push(
      runScenario(positionGreeks, underlyingPrices, portfolioValue, {
        label: `IV ${iv >= 0 ? "+" : ""}${iv} pts`,
        priceChangePct: 0,
        ivChangePoints: iv,
        daysElapsed: 0,
      }),
    );
  }

  // Time decay
  const timeSteps = [1, 7, 30];
  for (const days of timeSteps) {
    scenarios.push(
      runScenario(positionGreeks, underlyingPrices, portfolioValue, {
        label: `${days} day${days > 1 ? "s" : ""} pass`,
        priceChangePct: 0,
        ivChangePoints: 0,
        daysElapsed: days,
      }),
    );
  }

  // Combined scenarios
  const combined = [
    { label: "Market -10%, IV +10", price: -0.10, iv: 10, days: 0 },
    { label: "Market +10%, IV -5", price: 0.10, iv: -5, days: 0 },
    { label: "Market -20%, 7 days", price: -0.20, iv: 0, days: 7 },
  ];

  for (const c of combined) {
    scenarios.push(
      runScenario(positionGreeks, underlyingPrices, portfolioValue, {
        label: c.label,
        priceChangePct: c.price,
        ivChangePoints: c.iv,
        daysElapsed: c.days,
      }),
    );
  }

  return {
    asOf,
    portfolioValue,
    scenarios: scenarios.sort((a, b) => a.estimatedPnL - b.estimatedPnL),
    approximationMethod: "delta-gamma",
  };
}

interface ScenarioInput {
  label: string;
  priceChangePct: number;
  ivChangePoints: number;
  daysElapsed: number;
}

function runScenario(
  positionGreeks: PositionGreek[],
  underlyingPrices: Map<string, number>,
  portfolioValue: number,
  input: ScenarioInput,
): ScenarioResult {
  let totalPnL = 0;

  for (const g of positionGreeks) {
    if (!g.greeksAvailable) continue;
    const price = underlyingPrices.get(g.symbol) ?? 0;
    totalPnL += estimateScenarioPnL(
      g,
      input.priceChangePct,
      price,
      input.ivChangePoints,
      input.daysElapsed,
    );
  }

  return {
    label: input.label,
    type:
      input.priceChangePct !== 0 && input.ivChangePoints !== 0
        ? "combined"
        : input.priceChangePct !== 0
          ? "price"
          : input.ivChangePoints !== 0
            ? "vol"
            : "time",
    priceChangePct: input.priceChangePct !== 0 ? input.priceChangePct : null,
    ivChangePoints: input.ivChangePoints !== 0 ? input.ivChangePoints : null,
    daysElapsed: input.daysElapsed !== 0 ? input.daysElapsed : null,
    estimatedPnL: totalPnL,
    estimatedPnLPct: portfolioValue > 0 ? totalPnL / portfolioValue : null,
    portfolioValue: portfolioValue + totalPnL,
  };
}

/**
 * Find the worst scenario from a stress test grid.
 */
export function worstScenario(grid: StressTestGrid): ScenarioResult | null {
  if (grid.scenarios.length === 0) return null;
  return grid.scenarios.reduce((worst, s) =>
    s.estimatedPnL < worst.estimatedPnL ? s : worst,
  );
}

/**
 * Estimate concentrated-symbol stress: what happens if a specific symbol drops.
 */
export function symbolDownScenario(
  positionGreeks: PositionGreek[],
  underlyingPrices: Map<string, number>,
  portfolioValue: number,
  symbol: string,
  dropPct: number,
): ScenarioResult | null {
  const symbolGreeks = positionGreeks.filter((g) => g.symbol === symbol);
  if (symbolGreeks.length === 0) return null;

  let totalPnL = 0;
  for (const g of symbolGreeks) {
    const price = underlyingPrices.get(g.symbol) ?? 0;
    totalPnL += estimateScenarioPnL(g, -dropPct, price, 0, 0);
  }

  return {
    label: `${symbol} down ${(dropPct * 100).toFixed(0)}%`,
    type: "price",
    priceChangePct: -dropPct,
    ivChangePoints: null,
    daysElapsed: null,
    estimatedPnL: totalPnL,
    estimatedPnLPct: portfolioValue > 0 ? totalPnL / portfolioValue : null,
    portfolioValue: portfolioValue + totalPnL,
  };
}
