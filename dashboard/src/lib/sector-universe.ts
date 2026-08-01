/**
 * Sector ETF universe for relative strength computation.
 *
 * Uses standard SPDR sector ETFs + a few industry/thematic ETFs for
 * granularity. SPY is the benchmark.
 */

export interface SectorETF {
  symbol: string;
  name: string;
  /** Broad category for grouping in displays */
  category: "sector" | "industry" | "benchmark";
}

export const SECTOR_ETFS: SectorETF[] = [
  // GICS Sectors (SPDR)
  { symbol: "XLC", name: "Communication Services", category: "sector" },
  { symbol: "XLY", name: "Consumer Discretionary", category: "sector" },
  { symbol: "XLP", name: "Consumer Staples", category: "sector" },
  { symbol: "XLE", name: "Energy", category: "sector" },
  { symbol: "XLF", name: "Financials", category: "sector" },
  { symbol: "XLV", name: "Health Care", category: "sector" },
  { symbol: "XLI", name: "Industrials", category: "sector" },
  { symbol: "XLB", name: "Materials", category: "sector" },
  { symbol: "XLRE", name: "Real Estate", category: "sector" },
  { symbol: "XLK", name: "Technology", category: "sector" },
  { symbol: "XLU", name: "Utilities", category: "sector" },

  // Industry / thematic
  { symbol: "SMH", name: "Semiconductors", category: "industry" },
  { symbol: "IBB", name: "Biotech", category: "industry" },
  { symbol: "XHB", name: "Homebuilders", category: "industry" },
  { symbol: "XRT", name: "Retail", category: "industry" },
  { symbol: "KRE", name: "Regional Banks", category: "industry" },
  { symbol: "XOP", name: "Oil & Gas Exploration", category: "industry" },
  { symbol: "GDX", name: "Gold Miners", category: "industry" },

  // Style & cap
  { symbol: "QQQ", name: "Nasdaq-100 (Large Growth)", category: "industry" },
  { symbol: "IWM", name: "Russell 2000 (Small Cap)", category: "industry" },
  { symbol: "DIA", name: "Dow Jones Industrial", category: "industry" },

  // Cross-asset
  { symbol: "TLT", name: "Long-Term Treasuries", category: "industry" },
  { symbol: "HYG", name: "High-Yield Corporate Bonds", category: "industry" },
  { symbol: "LQD", name: "Investment-Grade Corp Bonds", category: "industry" },
  { symbol: "GLD", name: "Gold", category: "industry" },
  { symbol: "USO", name: "Oil", category: "industry" },
  { symbol: "UUP", name: "US Dollar", category: "industry" },

  // Benchmark
  { symbol: "SPY", name: "S&P 500", category: "benchmark" },
];

export const BENCHMARK_SYMBOL = "SPY";
