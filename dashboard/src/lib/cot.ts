/**
 * CFTC Commitments of Traders (COT) parser.
 *
 * Downloads the weekly legacy futures-only COT report from the CFTC
 * (`deafut.txt`) and extracts positioning data for key contracts.
 *
 * Legacy format (comma-separated, this week + previous week + changes):
 *   Field 0: Commodity name (quoted)
 *   Field 1: Date (YYMMDD)
 *   Field 2: Date (YYYY-MM-DD)
 *   Field 3: CFTC contract code
 *   Field 4: Exchange code
 *   Field 5-6: CFTC sub-codes
 *   Fields 7-16: CURRENT WEEK
 *     7:  Open Interest
 *     8:  Non-Commercial Long
 *     9:  Non-Commercial Short
 *     10: Non-Commercial Spreading
 *     11: Commercial Long
 *     12: Commercial Short
 *     13: Total Long
 *     14: Total Short
 *     15: Non-Reportable Long
 *     16: Non-Reportable Short
 *   Fields 17-26: PREVIOUS WEEK (same order)
 *   Fields 27+: Changes
 *
 * Non-Commercial ≈ Managed Money / Speculators
 * Commercial = Hedgers / Producers
 *
 * New report every Friday 3:30 PM ET. Cache TTL: 7 days.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// ── Types ──

export interface COTContract {
  /** CFTC commodity name */
  name: string;
  /** Our shorthand */
  ticker: string;
  /** Non-Commercial (speculator): long contracts */
  speculatorLong: number;
  /** Non-Commercial (speculator): short contracts */
  speculatorShort: number;
  /** Non-Commercial: net position */
  speculatorNet: number;
  /** Non-Commercial: spreading */
  speculatorSpreading: number;
  /** Commercial (hedger): long contracts */
  commercialLong: number;
  /** Commercial (hedger): short contracts */
  commercialShort: number;
  /** Commercial: net position */
  commercialNet: number;
  /** Open interest */
  openInterest: number;
  /** Non-Reportable (small traders): long */
  nonReportableLong: number;
  /** Non-Reportable (small traders): short */
  nonReportableShort: number;
  /** CFTC contract code */
  contractCode: string;
  /** Report date */
  reportDate: string;
}

export interface COTSnapshot {
  contracts: COTContract[];
  fetchedAt: string;
  sourceUrl: string;
}

// ── Target contracts by CFTC contract code ──

// Ordered by preference: E-mini contracts preferred over consolidated
const TARGETS: Record<string, { ticker: string; supersedes?: string }> = {
  // Equity indices
  "13874A": { ticker: "ES" },   // E-mini S&P 500
  "209742": { ticker: "NQ" },   // E-mini Nasdaq-100 (preferred)
  "20974+": { ticker: "NQ", supersedes: "209742" },  // Nasdaq-100 Consolidated (skip if E-mini found)
  "239742": { ticker: "RTY" },  // E-mini Russell 2000
  // Volatility
  "1170E1": { ticker: "VX" },   // VIX Futures
  // Treasuries
  "043602": { ticker: "ZN" },   // 10Y Treasury Note
  "042601": { ticker: "ZT" },   // 2Y Treasury Note
  "044601": { ticker: "ZF" },   // 5Y Treasury Note
  "020604": { ticker: "UB" },   // Ultra UST Bond (30Y)
  // Commodities
  "088691": { ticker: "GC" },   // Gold
  "067651": { ticker: "CL" },   // WTI Crude Oil (physical)
  // Currencies
  "099741": { ticker: "EUR" },  // Euro FX
};

// ── Cache ──

const COT_URL = "https://www.cftc.gov/dea/newcot/deafut.txt";
const CACHE_DIR = path.join(process.cwd(), "node_modules/.cache/money-flow");
const CACHE_FILE = path.join(CACHE_DIR, "cot-snapshot.json");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ── Parser ──

/**
 * Parse legacy futures-only COT CSV.
 *
 * Field layout (current week, indices after commodity name + 6 header fields):
 *   0: Open Interest
 *   1: Non-Commercial Long
 *   2: Non-Commercial Short
 *   3: Non-Commercial Spreading
 *   4: Commercial Long
 *   5: Commercial Short
 *   6: Total Long
 *   7: Total Short
 *   8: Non-Reportable Long
 *   9: Non-Reportable Short
 */
function toNum(value: string): number {
  const num = Number(value.trim());
  return Number.isFinite(num) ? num : 0;
}

function parseCOTText(text: string): COTContract[] {
  const lines = text.split("\n");
  const results: COTContract[] = [];

  for (const line of lines) {
    if (line.length < 100) continue;

    const fields = line.split(",");

    // Need at least: name, date, date, code, exchange, sub1, sub2, +10 data fields
    if (fields.length < 17) continue;

    const contractCode = fields[3]?.trim() ?? "";
    const targetConfig = TARGETS[contractCode];
    if (!targetConfig) continue;

    const ticker = targetConfig.ticker;

    const name = (fields[0] ?? "").replace(/^"/, "").replace(/"$/, "").trim();
    const reportDate = fields[2]?.trim() ?? "";

    // Data starts at field 7 (after commodity name + 6 header fields)
    const dataStart = 7;

    const result: COTContract = {
      name,
      ticker,
      speculatorLong: toNum(fields[dataStart + 1] ?? "0"),
      speculatorShort: toNum(fields[dataStart + 2] ?? "0"),
      speculatorNet: 0, // computed below
      speculatorSpreading: toNum(fields[dataStart + 3] ?? "0"),
      commercialLong: toNum(fields[dataStart + 4] ?? "0"),
      commercialShort: toNum(fields[dataStart + 5] ?? "0"),
      commercialNet: 0,
      openInterest: toNum(fields[dataStart] ?? "0"),
      nonReportableLong: toNum(fields[dataStart + 8] ?? "0"),
      nonReportableShort: toNum(fields[dataStart + 9] ?? "0"),
      contractCode,
      reportDate,
    };

    result.speculatorNet = result.speculatorLong - result.speculatorShort;
    result.commercialNet = result.commercialLong - result.commercialShort;

    results.push(result);
  }

  return results.filter((contract) => {
    const config = TARGETS[contract.contractCode];
    if (!config?.supersedes) return true;
    // Remove this entry if the preferred (E-mini) code exists in results
    return !results.some((r) => r.contractCode === config.supersedes);
  });
}

async function loadCached(): Promise<COTSnapshot | null> {
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    const cached = JSON.parse(raw) as { data: COTSnapshot; at: number };
    if (Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  } catch {
    // No cache or stale
  }
  return null;
}

async function saveCache(snapshot: COTSnapshot): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    CACHE_FILE,
    JSON.stringify({ data: snapshot, at: Date.now() }),
    "utf8",
  );
}

export async function fetchCOT(): Promise<COTSnapshot> {
  const cached = await loadCached();
  if (cached) return cached;

  const response = await fetch(COT_URL);
  if (!response.ok) {
    throw new Error(
      `CFTC COT fetch failed: ${response.status} ${response.statusText}`,
    );
  }
  const text = await response.text();

  const contracts = parseCOTText(text);

  const snapshot: COTSnapshot = {
    contracts,
    fetchedAt: new Date().toISOString(),
    sourceUrl: COT_URL,
  };

  await saveCache(snapshot);
  return snapshot;
}
