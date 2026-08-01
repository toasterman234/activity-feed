/**
 * FRED (Federal Reserve Economic Data) API client.
 *
 * Uses the existing key at ~/.life/secrets/fred.env — same source as
 * life-os-knowledge-graph/runtime/hpi/fred_config.py.
 *
 * Call pattern: direct HTTP to api.stlouisfed.org from the Next.js server.
 * No fredapi Python dependency needed.
 */

import { readFileSync } from "node:fs";

const FRED_BASE = "https://api.stlouisfed.org/fred";

let cachedKey: string | null = null;

function loadFredKey(): string {
  if (cachedKey) return cachedKey;
  try {
    const contents = readFileSync(
      `${process.env.HOME}/.life/secrets/fred.env`,
      "utf8",
    );
    const match = contents.match(/^FRED_API_KEY=(.+)$/m);
    if (!match?.[1]) throw new Error("FRED_API_KEY not found in fred.env");
    cachedKey = match[1].trim();
    return cachedKey;
  } catch (error) {
    throw new Error(
      `FRED API key unavailable: ${(error as Error).message}. Expected at ~/.life/secrets/fred.env`,
    );
  }
}

// ── Types ──

export interface FredObservation {
  date: string;
  value: string; // FRED returns values as strings; "." means missing
}

export interface FredSeriesResponse {
  realtime_start: string;
  realtime_end: string;
  observation_start: string;
  observation_end: string;
  units: string;
  output_type: number;
  file_type: string;
  order_by: string;
  sort_order: string;
  count: number;
  offset: number;
  limit: number;
  observations: FredObservation[];
}

// ── Cache ──

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const seriesCache = new Map<string, CacheEntry<FredSeriesResponse>>();

function cacheGet(key: string, ttlMs: number) {
  const entry = seriesCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttlMs) {
    seriesCache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key: string, data: FredSeriesResponse) {
  seriesCache.set(key, { data, fetchedAt: Date.now() });
}

// ── Fetch ──

export async function fetchFredSeries(
  seriesId: string,
  options?: { limit?: number; sort?: "asc" | "desc"; ttlMs?: number },
): Promise<FredSeriesResponse> {
  const limit = options?.limit ?? 366;
  const sort = options?.sort ?? "desc";
  const ttlMs = options?.ttlMs ?? 6 * 60 * 60 * 1000; // 6 hours default

  const cacheKey = `${seriesId}:${limit}:${sort}`;
  const cached = cacheGet(cacheKey, ttlMs);
  if (cached) return cached;

  const apiKey = loadFredKey();
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: sort,
    limit: String(limit),
  });
  const url = `${FRED_BASE}/series/observations?${params}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FRED fetch failed for ${seriesId}: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as FredSeriesResponse;
  if (!data.observations) {
    throw new Error(`FRED returned no observations for ${seriesId}`);
  }
  cacheSet(cacheKey, data);
  return data;
}

/**
 * Convert FRED observation values (strings, "." = missing) to numbers.
 * Returns null for missing values.
 */
export function parseFredValue(value: string): number | null {
  if (value === "." || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse a FRED series into a date → value map.
 * Drops missing observations.
 */
export function seriesToMap(
  series: FredSeriesResponse,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const obs of series.observations) {
    const value = parseFredValue(obs.value);
    if (value !== null) map.set(obs.date, value);
  }
  return map;
}
