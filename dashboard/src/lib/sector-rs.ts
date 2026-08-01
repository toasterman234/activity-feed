/**
 * Sector relative strength computation.
 *
 * For each sector ETF, fetches 90-day price history from Market Lake,
 * computes excess returns vs. SPY, trend, and volume signals, then
 * ranks and scores the universe.
 *
 * Model: 35% short-term RS (20d), 30% medium-term RS (60d),
 *        20% trend (above 50/200 MA), 15% volume participation.
 *
 * Adapted from yu_institutional_engine_python's rotation_model.py.
 */

import { type DailyBar } from "./market-lake";
import {
  BENCHMARK_SYMBOL,
  SECTOR_ETFS,
  type SectorETF,
} from "./sector-universe";

/** Direct server-side fetch to Market Lake API (bypasses Next.js rewrites) */
const MARKET_LAKE = process.env.MARKET_LAKE_URL ?? "http://127.0.0.1:9077";

async function fetchML<T>(path: string, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${MARKET_LAKE}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Market Lake ${path}: ${res.status}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

async function getHistoricalPrices(symbol: string, days = 90): Promise<DailyBar[]> {
  const data = await fetchML<{ rows: DailyBar[] }>(
    `/prices/historical/${symbol}?limit=${days}&sort=desc`,
  );
  return data.rows;
}

// ── Types ──

export interface SectorRSResult {
  symbol: string;
  name: string;
  category: SectorETF["category"];
  /** 0–100 composite score, normalized across universe */
  score: number;
  /** 20-day excess return vs. benchmark (decimal) */
  excessReturn20d: number;
  /** 60-day excess return vs. benchmark (decimal) */
  excessReturn60d: number;
  /** Close above 50-day simple moving average */
  above50MA: boolean;
  /** Close above 200-day simple moving average */
  above200MA: boolean;
  /** 20-day average volume / 60-day average volume */
  volumeRatio: number;
  /** 1 = strongest in universe */
  rank: number;
}

export interface SectorRSSnapshot {
  sectors: SectorRSResult[];
  benchmark: { symbol: string; return20d: number; return60d: number };
  asOf: string;
}

// ── Helpers ──

function adjClose(bar: DailyBar): number {
  return bar.adj_close ?? bar.close ?? 0;
}

function volume(bar: DailyBar): number {
  return bar.volume ?? 0;
}

function sma(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 0.5);
  return values.map((v) => (v - min) / range);
}

// ── Computation ──

interface SectorPrices {
  symbol: string;
  name: string;
  category: SectorETF["category"];
  closes: number[];
  volumes: number[];
  closeNow: number;
}

async function fetchSectorPrices(): Promise<{
  sectors: SectorPrices[];
  benchmark: SectorPrices;
}> {
  // Fetch in batches of 8 to avoid overwhelming Market Lake
  const BATCH = 8;
  const all: Array<{ etf: SectorETF; bars: DailyBar[] }> = [];

  for (let i = 0; i < SECTOR_ETFS.length; i += BATCH) {
    const batch = SECTOR_ETFS.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map(async (etf) => {
        try {
          const bars = await getHistoricalPrices(etf.symbol, 90);
          return { etf, bars, ok: true as const };
        } catch (err) {
          console.warn(`Market Lake fetch failed for ${etf.symbol}: ${(err as Error).message}`);
          return { etf, bars: [], ok: false as const };
        }
      }),
    );
    all.push(...batchResults.map(({ etf, bars }) => ({ etf, bars })));
  }

  const toPrices = (etf: SectorETF, bars: DailyBar[]): SectorPrices => ({
    symbol: etf.symbol,
    name: etf.name,
    category: etf.category,
    closes: bars.map((b) => adjClose(b)).filter((v) => v > 0),
    volumes: bars.map((b) => volume(b)),
    closeNow: bars.length > 0 ? adjClose(bars[bars.length - 1]) : 0,
  });

  const sectors: SectorPrices[] = [];
  let benchmark: SectorPrices | null = null;

  for (const { etf, bars } of all) {
    const prices = toPrices(etf, bars);
    if (etf.symbol === BENCHMARK_SYMBOL) {
      benchmark = prices;
    } else {
      sectors.push(prices);
    }
  }

  if (!benchmark || benchmark.closes.length < 21) {
    throw new Error("Failed to fetch benchmark (SPY) prices or insufficient data");
  }
  return { sectors, benchmark };
}

export async function computeSectorRS(): Promise<SectorRSSnapshot> {
  const { sectors: sp, benchmark: bp } = await fetchSectorPrices();

  const spyReturn20d = bp.closes[bp.closes.length - 1] / bp.closes[bp.closes.length - 21] - 1;
  const spyReturn60d = bp.closes.length >= 61
    ? bp.closes[bp.closes.length - 1] / bp.closes[bp.closes.length - 61] - 1
    : 0;

  const results: SectorRSResult[] = sp
    .filter((s) => s.closes.length >= 21)
    .map((s) => {
      const n = s.closes.length;
      const ret20d = s.closes[n - 1] / s.closes[n - 21] - 1;
      const ret60d = n >= 61 ? s.closes[n - 1] / s.closes[n - 61] - 1 : 0;

      return {
        symbol: s.symbol,
        name: s.name,
        category: s.category,
        score: 0,
        excessReturn20d: ret20d - spyReturn20d,
        excessReturn60d: ret60d - spyReturn60d,
        above50MA: s.closeNow > sma(s.closes.slice(-Math.min(50, n))),
        above200MA: s.closeNow > sma(s.closes.slice(-Math.min(200, n))),
        volumeRatio: (() => {
          const v20 = s.volumes.length >= 20 ? sma(s.volumes.slice(-20)) : sma(s.volumes);
          const v60 = s.volumes.length >= 60 ? sma(s.volumes.slice(-60)) : sma(s.volumes);
          return v60 > 0 ? v20 / v60 : 1;
        })(),
        rank: 0,
      };
    });

  const n = results.length;
  if (n === 0) {
    return {
      sectors: [],
      benchmark: { symbol: bp.symbol, return20d: spyReturn20d, return60d: spyReturn60d },
      asOf: new Date().toISOString(),
    };
  }

  const rs20Norm = normalize(results.map((r) => r.excessReturn20d));
  const rs60Norm = normalize(results.map((r) => r.excessReturn60d));
  const trendScores = results.map((r) => (r.above50MA ? 0.5 : 0) + (r.above200MA ? 0.5 : 0));
  const volNorm = normalize(results.map((r) => r.volumeRatio));

  for (let i = 0; i < n; i++) {
    results[i].score = Math.round(
      (rs20Norm[i] * 0.35 + rs60Norm[i] * 0.30 + trendScores[i] * 0.20 + volNorm[i] * 0.15) * 100,
    );
  }

  results.sort((a, b) => b.score - a.score);
  for (let i = 0; i < n; i++) results[i].rank = i + 1;

  return {
    sectors: results,
    benchmark: {
      symbol: bp.symbol,
      return20d: Math.round(spyReturn20d * 10000) / 100,
      return60d: Math.round(spyReturn60d * 10000) / 100,
    },
    asOf: new Date().toISOString(),
  };
}
