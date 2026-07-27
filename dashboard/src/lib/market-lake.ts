// Market Lake API client — fetched through the dashboard's own origin via
// the /market-lake rewrite in next.config.ts. Must NOT hit localhost:9077
// directly: on phone/Tailscale access "localhost" resolves to the client
// device, not the Mac running the backend, so every fetch would fail there
// while still working fine when tested from the same machine as the server.
// These endpoints change per-second so we fetch on demand, not via electric sync.

const API_BASE = "/market-lake";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
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

// ── Symbol search (typeahead) ──

export interface SymbolSearchResult {
  symbol: string;
  asset_type: string | null;
  sector: string | null;
}

export async function searchSymbols(query: string, limit = 8): Promise<SymbolSearchResult[]> {
  if (!query.trim()) return [];
  const data = await fetchJSON<{ rows: SymbolSearchResult[] }>(
    `/symbols/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`
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

// ── Candidate inspection ──

export interface ResponseMeta {
  as_of: string;
  source: string;
  warnings?: string[];
}

export interface FundamentalSnapshot {
  symbol: string;
  date: string;
  sector?: string | null;
  industry?: string | null;
  ivr_252d?: number | null;
  vrp_30d?: number | null;
  mom_12m?: number | null;
  gross_margin?: number | null;
  net_margin?: number | null;
  roe?: number | null;
  current_ratio?: number | null;
  debt_to_equity?: number | null;
  fcf_margin?: number | null;
  revenue_growth_yoy?: number | null;
  altman_z_score?: number | null;
  piotroski_score?: number | null;
  is_financially_healthy?: boolean | null;
  is_not_distressed?: boolean | null;
  has_manageable_debt?: boolean | null;
  has_adequate_liquidity?: boolean | null;
  fundamental_tier?: string | null;
  composite_score?: number | null;
}

export interface DividendSnapshot {
  symbol: string;
  latest_ex_date?: string | null;
  latest_cash_amount?: number | null;
  stated_frequency?: string | null;
  trailing_12m_yield?: number | null;
  trailing_12m_regular_yield?: number | null;
  source?: string | null;
}

export interface VRPSnapshot {
  date: string;
  iv_30d?: number | null;
  ivr_252d?: number | null;
  ivp_252d?: number | null;
  vrp_30d?: number | null;
  hv30?: number | null;
  ts_slope_30_60?: number | null;
  put_skew_25d?: number | null;
  pc_volume_ratio?: number | null;
}

export interface PortfolioPosition {
  symbol: string;
  description?: string | null;
  units: number;
  price: number;
  market_value: number;
  open_pnl?: number | null;
  avg_cost?: number | null;
  sector?: string | null;
  beta?: number | null;
}

export interface CandidateInspection {
  prices: DailyBar[];
  fundamentals: FundamentalSnapshot | null;
  fundamentalsMeta: ResponseMeta | null;
  dividends: DividendSnapshot | null;
  dividendsMeta: ResponseMeta | null;
  vrp: VRPSnapshot | null;
  vrpMeta: ResponseMeta | null;
  positions: Array<PortfolioPosition & { account: "Schwab" | "Fidelity" }>;
  unavailable: string[];
}

async function optionalRequest<T>(label: string, request: Promise<T>) {
  try {
    return { label, value: await request, error: false as const };
  } catch {
    return { label, value: null, error: true as const };
  }
}

export async function getCandidateInspection(symbol: string): Promise<CandidateInspection> {
  const normalized = symbol.trim().toUpperCase();
  const [prices, fundamentals, dividends, vrp, schwab, fidelity] = await Promise.all([
    optionalRequest("price history", fetchJSON<{ rows: DailyBar[] }>(
      `/prices/historical/${normalized}?limit=90&sort=desc`,
      { signal: AbortSignal.timeout(8_000) },
    )),
    optionalRequest("fundamentals", fetchJSON<{ rows: FundamentalSnapshot[]; meta: ResponseMeta }>(
      `/fundamentals/${normalized}`,
      { signal: AbortSignal.timeout(8_000) },
    )),
    optionalRequest("dividends", fetchJSON<{ rows: DividendSnapshot[]; meta: ResponseMeta }>(
      `/dividends/profile/${normalized}`,
      { signal: AbortSignal.timeout(8_000) },
    )),
    optionalRequest("volatility", fetchJSON<{ rows: VRPSnapshot[]; meta: ResponseMeta }>(
      `/symbol/${normalized}/vrp/latest`,
      { signal: AbortSignal.timeout(8_000) },
    )),
    optionalRequest("Schwab holdings", fetchJSON<{ rows: PortfolioPosition[] }>(
      "/portfolio/schwab/positions",
      { signal: AbortSignal.timeout(8_000) },
    )),
    optionalRequest("Fidelity holdings", fetchJSON<{ rows: PortfolioPosition[] }>(
      "/portfolio/fidelity/positions",
      { signal: AbortSignal.timeout(8_000) },
    )),
  ]);

  const positions = [
    ...((schwab.value?.rows ?? []).map((row) => ({ ...row, account: "Schwab" as const }))),
    ...((fidelity.value?.rows ?? []).map((row) => ({ ...row, account: "Fidelity" as const }))),
  ].filter((row) => row.symbol.toUpperCase() === normalized);

  return {
    prices: [...(prices.value?.rows ?? [])].reverse(),
    fundamentals: fundamentals.value?.rows[0] ?? null,
    fundamentalsMeta: fundamentals.value?.meta ?? null,
    dividends: dividends.value?.rows[0] ?? null,
    dividendsMeta: dividends.value?.meta ?? null,
    vrp: vrp.value?.rows[0] ?? null,
    vrpMeta: vrp.value?.meta ?? null,
    positions,
    unavailable: [prices, fundamentals, dividends, vrp, schwab, fidelity]
      .filter((result) => result.error)
      .map((result) => result.label),
  };
}

export interface PortfolioSnapshot {
  positions: Array<PortfolioPosition & { account: "Schwab" | "Fidelity" }>;
  unavailable: string[];
}

export async function getPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  const [schwab, fidelity] = await Promise.all([
    optionalRequest("Schwab holdings", fetchJSON<{ rows: PortfolioPosition[] }>(
      "/portfolio/schwab/positions",
      { signal: AbortSignal.timeout(8_000) },
    )),
    optionalRequest("Fidelity holdings", fetchJSON<{ rows: PortfolioPosition[] }>(
      "/portfolio/fidelity/positions",
      { signal: AbortSignal.timeout(8_000) },
    )),
  ]);
  return {
    positions: [
      ...((schwab.value?.rows ?? []).map((row) => ({ ...row, account: "Schwab" as const }))),
      ...((fidelity.value?.rows ?? []).map((row) => ({ ...row, account: "Fidelity" as const }))),
    ],
    unavailable: [schwab, fidelity].filter((result) => result.error).map((result) => result.label),
  };
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

export type HistoricalScannerMode = "vrp" | "fundamental" | "momentum" | "dividend" | "composite" | "ta";

export interface UnifiedScanResult {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  last_close?: number | null;
  mkt_cap_b?: number | null;
  composite_score?: number | null;
  ivr?: number | null;
  vrp_30d?: number | null;
  piotroski_score?: number | null;
  debt_to_equity?: number | null;
  mom_12m?: number | null;
  trend_regime?: string | null;
  trailing_12m_regular_yield?: number | null;
  rsi_14?: number | null;
  [key: string]: unknown;
}

export interface UnifiedScanResponse {
  rows: UnifiedScanResult[];
  total: number;
  mode: HistoricalScannerMode;
  meta: {
    as_of: string;
    source: string;
    warnings: string[];
  };
}

export interface UnifiedScanFilters {
  marketCap?: string;
  hasOptions?: string;
  ivrLevel?: string;
  vrpLevel?: string;
  piotroskiLevel?: string;
  debtLevel?: string;
  momentumLevel?: string;
  trendRegime?: string;
  yieldLevel?: string;
  rsiSignal?: string;
}

export async function getUnifiedScan(
  mode: HistoricalScannerMode,
  filters: UnifiedScanFilters,
  topN = 30,
): Promise<UnifiedScanResponse> {
  const params = new URLSearchParams({ mode, limit: String(topN) });
  const mapped: Record<string, string | undefined> = {
    mkt_cap: filters.marketCap,
    has_options: filters.hasOptions,
    ivr_level: filters.ivrLevel,
    vrp_level: filters.vrpLevel,
    piotroski_level: filters.piotroskiLevel,
    debt_level: filters.debtLevel,
    mom_12m_level: filters.momentumLevel,
    trend_regime: filters.trendRegime,
    yield_level: filters.yieldLevel,
    rsi_signal: filters.rsiSignal,
  };
  for (const [key, value] of Object.entries(mapped)) {
    if (value) params.set(key, value);
  }
  return fetchJSON<UnifiedScanResponse>(`/scan/unified?${params}`, {
    signal: AbortSignal.timeout(12_000),
  });
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
  verdict: string;
  evidence?: string | null;
  regime?: string | null;
  title: string;
  headline?: string | null;
  key_metric?: string | null;
  ran_at?: string | null;
}

export async function getFindings(strategy = ""): Promise<ResearchFinding[]> {
  const params = strategy ? `?strategy=${encodeURIComponent(strategy)}` : "";
  const data = await fetchJSON<{ rows: ResearchFinding[] }>(`/research/findings${params}`, {
    signal: AbortSignal.timeout(8_000),
  });
  return data.rows;
}

// ── Option Chain ──

export interface OptionRow {
  symbol: string;
  side: "call" | "put";
  strike: number | null;
  last: number | null;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  volume: number | null;
  open_interest: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  implied_volatility: number | null;
  timestamp: string | null;
}

export interface OptionChainResponse {
  symbol: string;
  expiration: string | null;
  calls: OptionRow[];
  puts: OptionRow[];
}

const OPTION_NUMBER_FIELDS = [
  "strike",
  "last",
  "bid",
  "ask",
  "mid",
  "volume",
  "open_interest",
  "delta",
  "gamma",
  "theta",
  "vega",
  "rho",
  "implied_volatility",
] as const satisfies ReadonlyArray<keyof OptionRow>;

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeOptionRow(row: Record<string, unknown>): OptionRow {
  const normalized = { ...row } as unknown as OptionRow;
  for (const field of OPTION_NUMBER_FIELDS) {
    normalized[field] = nullableNumber(row[field]) as never;
  }
  return normalized;
}

export async function getOptionExpirations(symbol: string): Promise<string[]> {
  const data = await fetchJSON<{ expirations: string[] }>(`/live/option-expirations/${symbol}`);
  return data.expirations;
}

export async function getOptionChain(
  symbol: string,
  expiration?: string
): Promise<OptionChainResponse> {
  const qs = expiration ? `?expiration=${expiration}` : "";
  const data = await fetchJSON<{
    symbol: string;
    expiration: string | null;
    calls?: Array<Record<string, unknown>>;
    puts?: Array<Record<string, unknown>>;
  }>(`/live/option-chain/${symbol}${qs}`);
  return {
    symbol: data.symbol,
    expiration: data.expiration,
    calls: (data.calls ?? []).map(normalizeOptionRow),
    puts: (data.puts ?? []).map(normalizeOptionRow),
  };
}

// ── Public.com live options screener ──

export interface PublicScreenerResult {
  symbol: string;
  last: number | null;
  change_pct: number | null;
  expiration: string | null;
  atm_iv: number | null;
  put_call_volume: number | null;
  option_volume: number;
  contracts: number;
}

export async function getPublicScreener(
  symbols: string[],
  minIv = 0.3,
  topN = 30
): Promise<PublicScreenerResult[]> {
  const [quotes, chains] = await Promise.all([
    getLiveQuotes(symbols),
    Promise.all(
      symbols.map(async (symbol) => {
        try {
          return await getOptionChain(symbol);
        } catch {
          return null;
        }
      })
    ),
  ]);
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));

  return chains
    .flatMap((chain) => {
      if (!chain) return [];
      const quote = quoteBySymbol.get(chain.symbol);
      const rows = [...chain.calls, ...chain.puts];
      const priced = rows
        .filter((row) => row.strike != null && row.implied_volatility != null)
        .sort(
          (a, b) =>
            Math.abs((a.strike ?? 0) - (quote?.last ?? 0)) -
            Math.abs((b.strike ?? 0) - (quote?.last ?? 0))
        );
      const atmIv = priced[0]?.implied_volatility ?? null;
      const callVolume = chain.calls.reduce((sum, row) => sum + (row.volume ?? 0), 0);
      const putVolume = chain.puts.reduce((sum, row) => sum + (row.volume ?? 0), 0);
      const optionVolume = callVolume + putVolume;

      if (atmIv == null || atmIv < minIv) return [];
      return [{
        symbol: chain.symbol,
        last: quote?.last ?? null,
        change_pct: quote?.change_pct ?? null,
        expiration: chain.expiration,
        atm_iv: atmIv,
        put_call_volume: callVolume > 0 ? putVolume / callVolume : null,
        option_volume: optionVolume,
        contracts: rows.length,
      }];
    })
    .sort((a, b) => (b.atm_iv ?? 0) - (a.atm_iv ?? 0))
    .slice(0, topN);
}
