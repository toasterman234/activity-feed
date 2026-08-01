/**
 * Risk regime classifier.
 *
 * Combines FRED macro series into a risk-on / neutral / risk-off
 * composite score. Modeled after yu_institutional_engine's cross-asset
 * regime detector.
 *
 * Scoring inputs (5 signals, equal weight):
 *   - HY OAS (BAMLH0A0HYM2): credit stress proxy
 *   - IG OAS (BAMLC0A0CM): investment-grade credit
 *   - 10Y-2Y spread (T10Y2Y): yield curve signal
 *   - VIX (VIXCLS): fear gauge
 *   - TED spread (TEDRATE): interbank stress
 *
 * Context data (included in snapshot, not scored):
 *   - 10Y Treasury (DGS10), 2Y Treasury (DGS2)
 *   - Trade-weighted USD (DTWEXBGS)
 *   - WTI Crude Oil (DCOILWTICO)
 *   - S&P 500 (SP500)
 *
 * Output: RiskAppetiteSnapshot with regime, 0-100 score, all signals.
 */

import { fetchFredSeries, parseFredValue } from "./fred";

// ── Types ──

export type RiskRegime = "risk-on" | "neutral" | "risk-off";

export interface RiskSignal {
  latest: number;
  avg1y: number;
  /** direction: positive = expansionary/risk-on, negative = contractionary/risk-off */
  direction: "positive" | "negative" | "neutral";
  /** normalized contribution 0-1 */
  contribution: number;
}

export interface RiskAppetiteSnapshot {
  regime: RiskRegime;
  /** 0-100 composite: higher = more risk appetite */
  score: number;
  creditSpread: RiskSignal;
  investmentGradeSpread: RiskSignal;
  yieldCurve: RiskSignal;
  vix: RiskSignal;
  tedSpread: RiskSignal;
  context: {
    treasury10Y: number | null;
    treasury2Y: number | null;
    dollarIndex: number | null;
    wtiCrude: number | null;
    sp500: number | null;
  };
  asOf: string;
}

// ── Constants ──

const REGIME_THRESHOLDS = { riskOn: 65, riskOff: 35 } as const;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// ── Scoring functions ──

/**
 * Clamp and normalize a raw value into 0-1.
 * All scores: 0 = worst (risk-off), 1 = best (risk-on).
 *
 * HY OAS:   FRED returns percent. 0 at 8%+, 1 at 2.5%-
 * IG OAS:   FRED returns percent. 0 at 3%+, 1 at 0.8%-
 * YC:       FRED returns decimal. 0 at -1.0%, 1 at +2.0%
 * VIX:      0 at 35+, 1 at 12-
 * TED:      FRED returns decimal. 0 at 1.0%+, 1 at 0.1%-
 */
function scoreHYSread(latest: number): number {
  return Math.round(Math.max(0, Math.min(1, 1 - (latest - 2.5) / 5.5)) * 100) / 100;
}

function scoreIGSpread(latest: number): number {
  return Math.round(Math.max(0, Math.min(1, 1 - (latest - 0.8) / 2.2)) * 100) / 100;
}

function scoreYieldCurve(latest: number): number {
  return Math.round(Math.max(0, Math.min(1, (latest + 1) / 3)) * 100) / 100;
}

function scoreVix(latest: number): number {
  return Math.round(Math.max(0, Math.min(1, 1 - (latest - 12) / 23)) * 100) / 100;
}

function scoreTED(latest: number): number {
  return Math.round(Math.max(0, Math.min(1, 1 - (latest - 0.1) / 0.9)) * 100) / 100;
}

// ── Helpers ──

function signalDirection(
  latest: number,
  avg1y: number,
  inverted: boolean,
): RiskSignal["direction"] {
  const diff = inverted ? avg1y - latest : latest - avg1y;
  const pct = avg1y !== 0 ? Math.abs(diff / avg1y) : 0;
  if (pct < 0.05) return "neutral";
  return diff > 0 ? "positive" : "negative";
}

function classifyRegime(score: number): RiskRegime {
  if (score >= REGIME_THRESHOLDS.riskOn) return "risk-on";
  if (score <= REGIME_THRESHOLDS.riskOff) return "risk-off";
  return "neutral";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function yearValues(
  observations: Array<{ date: string; value: string }>,
  cutoff: string,
): number[] {
  return observations
    .filter((obs) => obs.date >= cutoff)
    .map((obs) => parseFredValue(obs.value))
    .filter((v): v is number => v !== null);
}

function buildSignal(
  latest: number,
  values1y: number[],
  inverted: boolean,
  scorer: (v: number) => number,
): RiskSignal {
  const avg1y = average(values1y);
  return {
    latest,
    avg1y,
    direction: signalDirection(latest, avg1y, inverted),
    contribution: scorer(latest),
  };
}

// ── Main ──

export async function getRiskAppetite(): Promise<RiskAppetiteSnapshot> {
  // Fetch 5 scoring + 5 context series in parallel
  const seriesIds = [
    "BAMLH0A0HYM2", // HY OAS
    "BAMLC0A0CM",   // IG OAS
    "T10Y2Y",       // 10Y-2Y
    "VIXCLS",       // VIX
    "TEDRATE",      // TED spread
    "DGS10",        // 10Y Treasury (context)
    "DGS2",         // 2Y Treasury (context)
    "DTWEXBGS",     // USD index (context)
    "DCOILWTICO",   // WTI crude (context)
    "SP500",        // S&P 500 (context)
  ];
  const [hy, ig, yc, vix, ted, dgs10, dgs2, usd, oil, sp500] = await Promise.all(
    seriesIds.map((id) => fetchFredSeries(id, { limit: 366, sort: "desc" })),
  );

  const cutoff = new Date(Date.now() - ONE_YEAR_MS).toISOString().slice(0, 10);

  // Latest values
  function latestObs(series: typeof hy): number | null {
    const obs = series.observations.slice(0, 1);
    return obs.length ? parseFredValue(obs[0].value) : null;
  }

  const hyLatest = latestObs(hy);
  const igLatest = latestObs(ig);
  const ycLatest = latestObs(yc);
  const vixLatest = latestObs(vix);
  const tedLatest = latestObs(ted);

  if (hyLatest === null || igLatest === null || ycLatest === null || vixLatest === null || tedLatest === null) {
    throw new Error("FRED series returned no usable observations for scoring signals");
  }

  // Build scoring signals
  const creditSpread = buildSignal(hyLatest, yearValues(hy.observations, cutoff), true, scoreHYSread);
  const investmentGradeSpread = buildSignal(igLatest, yearValues(ig.observations, cutoff), true, scoreIGSpread);
  const yieldCurve = buildSignal(ycLatest, yearValues(yc.observations, cutoff), false, scoreYieldCurve);
  const vixSignal = buildSignal(vixLatest, yearValues(vix.observations, cutoff), true, scoreVix);
  const tedSignal = buildSignal(tedLatest, yearValues(ted.observations, cutoff), true, scoreTED);

  // Composite: equal weight 5 signals
  const score = Math.round(
    (creditSpread.contribution +
     investmentGradeSpread.contribution +
     yieldCurve.contribution +
     vixSignal.contribution +
     tedSignal.contribution) / 5 * 100,
  );
  const regime = classifyRegime(score);

  return {
    regime,
    score,
    creditSpread,
    investmentGradeSpread,
    yieldCurve,
    vix: vixSignal,
    tedSpread: tedSignal,
    context: {
      treasury10Y: latestObs(dgs10),
      treasury2Y: latestObs(dgs2),
      dollarIndex: latestObs(usd),
      wtiCrude: latestObs(oil),
      sp500: latestObs(sp500),
    },
    asOf: new Date().toISOString(),
  };
}
