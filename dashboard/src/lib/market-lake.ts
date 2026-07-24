// Market Lake API client — direct fetch to the FastAPI/DuckDB backend.
// Used for live quotes, screeners, option chains, and research findings.
// These endpoints change per-second so we fetch on demand, not via electric sync.

const API_BASE = process.env.NEXT_PUBLIC_MARKET_LAKE_URL ?? "http://localhost:9077";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Market Lake ${path}: ${res.status}`);
  return res.json();
}

// ── Quotes ──

export interface LiveQuote {
  symbol: string;
  last: number | null;
  bid: number | null;
  ask: number | null;
  spread_pct: number | null;
  change_pct: number | null;
  previous_close: number | null;
  volume: number | null;
  timestamp: string | null;
}

export async function getLiveQuotes(symbols: string[]): Promise<LiveQuote[]> {
  const data = await fetchJSON<{ rows: LiveQuote[] }>(
    `/live/quotes?symbols=${symbols.join(",")}`
  );
  return data.rows;
}

// ── Historical prices ──

export interface DailyBar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adj_close: number | null;
  volume: number | null;
}

export async function getHistoricalPrices(
  symbol: string,
  days = 252
): Promise<DailyBar[]> {
  const data = await fetchJSON<{ rows: DailyBar[] }>(
    `/prices/historical/${symbol}?limit=${days}&sort=desc`
  );
  return data.rows.reverse();
}

// ── VRP Scan ──

export interface VRPResult {
  symbol: string;
  date: string;
  sector: string;
  asset_type: string;
  mkt_cap_b: number;
  ivr_252d: number;
  ivp_252d: number;
  vrp_30d: number;
  iv_30d: number;
  hv30: number;
  ts_slope_30_60: number;
  put_skew_25d: number;
  pc_volume_ratio: number;
  vol_regime: string;
  trend_regime: string;
  ivr_rank: number;
  vrp_rank: number;
}

export async function getVRPScan(
  minIvr = 0.3,
  topN = 30
): Promise<VRPResult[]> {
  const data = await fetchJSON<{ rows: VRPResult[] }>(
    `/vrp/scan?min_ivr=${minIvr}&top_n=${topN}`
  );
  return data.rows;
}

// ── Unified Scanner ──

export type ScannerMode = "vrp" | "fundamentals" | "momentum" | "dividends" | "composite";

export async function getUnifiedScan(
  mode: ScannerMode = "vrp",
  topN = 30
): Promise<Record<string, unknown>[]> {
  const data = await fetchJSON<{ rows: Record<string, unknown>[] }>(
    `/unified-scanner/${mode}?limit=${topN}`
  );
  return data.rows;
}

// ── Research ──

export interface StrategyCard {
  strategy: string;
  status: string;
  verdict_mix: Record<string, number>;
  last_updated: string;
}

export async function getStrategies(): Promise<StrategyCard[]> {
  const data = await fetchJSON<{ rows: StrategyCard[] }>("/research/strategies");
  return data.rows;
}

export interface ResearchFinding {
  finding_key: string;
  strategy: string;
  status: string;
  summary: string;
  date: string;
}

export async function getFindings(): Promise<ResearchFinding[]> {
  const data = await fetchJSON<{ rows: ResearchFinding[] }>("/research/findings");
  return data.rows;
}

// ── Option Chain ──

export interface OptionRow {
  symbol: string;
  strike: number;
  expiry: string;
  type: "call" | "put";
  bid: number;
  ask: number;
  last: number;
  volume: number;
  open_interest: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  implied_vol: number;
}

export async function getOptionChain(
  symbol: string,
  expiration?: string
): Promise<{ symbol: string; expiration: string; calls: OptionRow[]; puts: OptionRow[] }> {
  const qs = expiration ? `?expiration=${expiration}` : "";
  return fetchJSON(`/live/option-chain/${symbol}${qs}`);
}
