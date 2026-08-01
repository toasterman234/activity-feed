// ── Greek aggregation ──
// Portfolio-level Greek calculations from position data + option Greek snapshots.
// All functions are pure: they receive data, return results.
// Direction convention: short options have negative quantity, so signed Greek = contractGreek × qty × 100.

import type {
  NormalizedPosition,
  OptionGreekSnapshot,
  AggregatedGreeks,
  PositionGreek,
} from "./types";

const MULTIPLIER = 100; // standard US equity option multiplier

/**
 * Aggregate portfolio Greeks from a list of positions and their associated
 * option Greek snapshots. Non-option positions contribute only delta (1.0 per
 * share for stocks, no gamma/theta/vega).
 */
export function aggregateGreeks(
  positions: NormalizedPosition[],
  optionGreeks: Map<string, OptionGreekSnapshot>, // keyed by position symbol
  asOf: string,
): AggregatedGreeks {
  const positionGreeks: PositionGreek[] = [];
  const positionsWithoutGreeks: string[] = [];

  let netDelta = 0;
  let netDeltaDollars = 0;
  let netGamma = 0;
  let netTheta = 0;
  let netVega = 0;
  let netRho = 0;

  for (const pos of positions) {
    const qty = pos.quantity;
    const price = pos.marketPrice ?? 0;

    if (pos.assetType === "stock" || pos.assetType === "crypto") {
      // Stock/crypto: delta = 1.0 per share, no greeks
      const delta = qty;
      const deltaDollars = delta * price;
      netDelta += delta;
      netDeltaDollars += deltaDollars;
      positionGreeks.push({
        symbol: pos.symbol,
        quantity: qty,
        optionType: "call", // irrelevant, not displayed
        strike: null,
        expiration: null,
        delta,
        gamma: 0,
        theta: 0,
        vega: 0,
        rho: 0,
        deltaDollars,
        greeksAvailable: true,
        greekSource: "market-lake",
      });
      continue;
    }

    if (pos.assetType === "option" && pos.optionType) {
      const greeks = optionGreeks.get(pos.symbol);
      if (!greeks || greeks.delta == null) {
        positionsWithoutGreeks.push(pos.symbol);
        // Still contribute a zero-greek entry for visibility
        positionGreeks.push({
          symbol: pos.symbol,
          quantity: qty,
          optionType: pos.optionType,
          strike: pos.optionStrike ?? null,
          expiration: pos.optionExpiry ?? null,
          delta: 0,
          gamma: 0,
          theta: 0,
          vega: 0,
          rho: 0,
          deltaDollars: 0,
          greeksAvailable: false,
          greekSource: "unavailable",
        });
        continue;
      }

      // Signed Greeks: contract Greek × quantity × 100
      // quantity is positive for long, negative for short
      const signedDelta = (greeks.delta ?? 0) * qty * MULTIPLIER;
      const signedGamma = (greeks.gamma ?? 0) * qty * MULTIPLIER;
      const signedTheta = (greeks.theta ?? 0) * qty * MULTIPLIER;
      const signedVega = (greeks.vega ?? 0) * qty * MULTIPLIER;
      const signedRho = (greeks.rho ?? 0) * qty * MULTIPLIER;
      const deltaDollars = (greeks.delta ?? 0) * price * qty * MULTIPLIER;

      netDelta += signedDelta;
      netDeltaDollars += deltaDollars;
      netGamma += signedGamma;
      netTheta += signedTheta;
      netVega += signedVega;
      netRho += signedRho;

      positionGreeks.push({
        symbol: pos.symbol,
        quantity: qty,
        optionType: greeks.side,
        strike: greeks.strike,
        expiration: greeks.expiration,
        delta: signedDelta,
        gamma: signedGamma,
        theta: signedTheta,
        vega: signedVega,
        rho: signedRho,
        deltaDollars,
        greeksAvailable: true,
        greekSource: "market-lake",
      });
      continue;
    }

    // Cash / other: no Greeks
    positionsWithoutGreeks.push(pos.symbol);
  }

  return {
    asOf,
    netDelta,
    netDeltaDollars,
    netGamma,
    netTheta,
    netVega,
    netRho,
    positionGreeks,
    positionsWithoutGreeks,
  };
}

/**
 * Map OptionGreekSnapshot from Market Lake OptionRow data.
 */
export function toGreekSnapshot(
  symbol: string,
  side: "call" | "put",
  row: {
    strike?: number | null;
    expiration?: string | null;
    delta?: number | null;
    gamma?: number | null;
    theta?: number | null;
    vega?: number | null;
    rho?: number | null;
    implied_volatility?: number | null;
    bid?: number | null;
    ask?: number | null;
    mid?: number | null;
    volume?: number | null;
    open_interest?: number | null;
    timestamp?: string | null;
  },
): OptionGreekSnapshot {
  return {
    symbol,
    side,
    strike: row.strike ?? null,
    expiration: row.expiration ?? null,
    delta: row.delta ?? null,
    gamma: row.gamma ?? null,
    theta: row.theta ?? null,
    vega: row.vega ?? null,
    rho: row.rho ?? null,
    impliedVolatility: row.implied_volatility ?? null,
    bid: row.bid ?? null,
    ask: row.ask ?? null,
    mid: row.mid ?? null,
    volume: row.volume ?? null,
    openInterest: row.open_interest ?? null,
    timestamp: row.timestamp ?? null,
  };
}
