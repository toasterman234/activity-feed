# Money Flow Data Pipeline — Build Plan

## What we're building

A data pipeline that answers **where money is flowing** across sectors and risk regimes — pulling from FRED and Market Lake, exposing computation results as typed library modules with API routes. No UI, no portfolio data.

The core question: "Right now, where is money going?"

We answer it through three lenses:
1. **Risk appetite** — Is the market in risk-on or risk-off mode? (FRED)
2. **Sector rotation** — Which sectors are leading/lagging? (Market Lake prices)
3. **Institutional positioning** — What are futures traders doing? (CFTC COT, deferred)

---

## Phase 1: FRED Integration — Risk Appetite Data Layer

**Goal:** Pull 6–8 macro series from FRED, expose as a typed library module with an API route. No UI — just the data layer.

### 1a. Add FRED data fetcher

**New file:** `dashboard/src/lib/fred.ts`

A typed fetch wrapper hitting the FRED REST API directly (no `fredapi` Python dep — Next.js makes HTTP calls from the server).

Series to pull:

| Series ID | Label | What it tells us |
|---|---|---|
| `BAMLH0A0HYM2` | High Yield OAS | Credit stress — widening = risk-off |
| `T10Y2Y` | 10Y–2Y Spread | Yield curve — inverted = recession signal |
| `VIXCLS` | VIX | Fear gauge |
| `DGS10` | 10Y Treasury | Risk-free rate |
| `DGS2` | 2Y Treasury | Short-rate expectations |
| `DTWEXBGS` | Trade-Weighted USD | Dollar strength |
| `DCOILWTICO` | WTI Crude Oil | Commodity/energy signal |
| `SP500` | S&P 500 Index | Equity benchmark |

Pull frequency: once daily, cached in memory with 6-hour TTL (FRED free tier = 1,000 req/day).

**FRED API key sourcing:** `~/.life/secrets/fred.env` — key `FRED_API_KEY=b5b55ce5ba4c5a5a034100a53bbf2838`. Already used by `life-os-knowledge-graph/runtime/hpi/fred_config.py`. Load same way: read file at process start, cache value.

### 1b. Add risk regime classifier

**New file:** `dashboard/src/lib/risk-regime.ts`

Takes the FRED series values and produces a typed classification:

```typescript
type RiskRegime = "risk-on" | "neutral" | "risk-off";

interface RiskAppetiteSnapshot {
  regime: RiskRegime;
  score: number;          // 0–100 composite
  signals: {
    creditSpread: number; // HY OAS level
    yieldCurve: number;   // 10Y-2Y spread
    vix: number;          // VIX level
  };
  asOf: string;
}
```

Composite score derived from: HY OAS widening vs 1-year average, 10Y-2Y inversion, VIX above/below 20.

### 1c. Add API route

**New file:** `dashboard/src/app/api/fred/risk-appetite/route.ts`

- GET handler that fetches from cache or FRED, classifies, returns typed JSON
- No UI component — just the data endpoint

**Files affected:**
```
NEW  dashboard/src/lib/fred.ts
NEW  dashboard/src/lib/risk-regime.ts
NEW  dashboard/src/app/api/fred/risk-appetite/route.ts
```

---

## Phase 2: Sector Relative Strength Computation

**Goal:** Compute sector-level momentum scores from Market Lake prices. Expose as typed library + API route. No UI.

### 2a. Define sector ETF universe

**New file:** `dashboard/src/lib/sector-universe.ts`

Hardcoded list of ~12 sector/industry ETFs + SPY benchmark:

```
XLC (Comm), XLY (Disc), XLP (Staples), XLE (Energy), XLF (Financials),
XLV (Health), XLI (Industrials), XLB (Materials), XLRE (Real Estate),
XLK (Tech), XLU (Utilities), SMH (Semis), IBB (Biotech), SPY (benchmark)
```

### 2b. Compute relative strength

**New file:** `dashboard/src/lib/sector-rs.ts`

Approach (from yu_institutional_engine):

For each sector ETF, fetch 90 days of daily closes from Market Lake's `/prices/historical/{symbol}?limit=90&sort=desc`.

Score each sector on:
- **Short-term RS** (35%): 20-day excess return vs. SPY, cross-sectionally ranked
- **Medium-term RS** (30%): 60-day excess return vs. SPY, cross-sectionally ranked
- **Trend** (20%): Above/below 50-day and 200-day MA
- **Volume participation** (15%): 20-day volume vs. 60-day average volume

Returns a typed result per sector:

```typescript
interface SectorRSResult {
  symbol: string;
  name: string;
  score: number;           // 0–100, normalized across universe
  excessReturn20d: number;
  excessReturn60d: number;
  above50MA: boolean;
  above200MA: boolean;
  volumeRatio: number;
  rank: number;            // 1 = strongest
}

type SectorRSSnapshot = SectorRSResult[];  // sorted by rank
```

### 2c. Add API route

**New file:** `dashboard/src/app/api/finance/sector-rs/route.ts`

- Computes RS scores server-side (Market Lake is local, not phone-accessible)
- 30-minute in-memory cache
- Returns full snapshot as JSON

**Files affected:**
```
NEW  dashboard/src/lib/sector-universe.ts
NEW  dashboard/src/lib/sector-rs.ts
NEW  dashboard/src/app/api/finance/sector-rs/route.ts
```

---



---

## Phase 3: COT Positioning Data (deferred)

Institutional futures positioning as an extra signal:

### 3a. COT fetcher

**New file:** `dashboard/src/lib/cot.ts`

- Download the weekly disaggregated COT text file from CFTC: `https://www.cftc.gov/dea/newcot/c_disagg.txt`
- Parse fixed-width format
- Extract S&P 500 E-mini, Nasdaq E-mini, VIX futures, 10Y Treasury futures
- Store as JSON cache with 7-day TTL (new file every Friday)

Key columns to extract:
- `ES` (S&P 500 E-mini): Managed Money net long vs. Commercial net short
- `NQ` (Nasdaq E-mini): Same
- `VX` (VIX futures): Managed Money net short (hedging) or long (speculation)

Display as a bar chart: Managed Money long — short position over last 26 weeks.

**Files affected:**
```
NEW  dashboard/src/lib/cot.ts
NEW  dashboard/src/app/api/finance/cot/route.ts
```

---

## Phase 4: Money Flow Snapshot (single combined endpoint, deferred)

Once phases 1–3 exist, add a single endpoint that returns the full money-flow picture:

**New file:** `dashboard/src/app/api/finance/money-flow/route.ts`

```typescript
interface MoneyFlowSnapshot {
  riskAppetite: RiskAppetiteSnapshot;
  sectorRotation: SectorRSSnapshot;
  cot?: COTSnapshot;
  asOf: string;
}
```

One fetch gives a client everything it needs. No UI — just the data.

---

## Data sources summary

| Source | How | Limits |
|---|---|---|
| **Market Lake** (:9077) | Existing API proxy (`/market-lake/*`) | Local, unlimited |
| **FRED** | New HTTP fetcher → `api.stlouisfed.org` | Free, 1,000 req/day |
| **FRED API key** | `~/.life/secrets/fred.env` — confirmed live | Already used by life-os scripts |
| **CFTC COT** (Phase 3) | `wget` weekly text file | Free, no API key |

---

## Execution order

```
Phase 1 (FRED risk data) ──▶ Phase 2 (Sector RS) ──▶ Phase 3 (COT, optional) ──▶ Phase 4 (combined snapshot, optional)
```

Phases 1 and 2 are independent — they can be built in parallel. Phase 3 and 4 are standalone additions on top.

## Files created (total)

```
NEW  dashboard/src/lib/fred.ts              (FRED API client)
NEW  dashboard/src/lib/risk-regime.ts        (risk-on/off classifier)
NEW  dashboard/src/app/api/fred/risk-appetite/route.ts
NEW  dashboard/src/lib/sector-universe.ts    (ETF ticker catalog)
NEW  dashboard/src/lib/sector-rs.ts          (RS computation)
NEW  dashboard/src/app/api/finance/sector-rs/route.ts
NEW  dashboard/src/lib/cot.ts                (COT parser, deferred)
NEW  dashboard/src/app/api/finance/cot/route.ts  (deferred)
NEW  dashboard/src/app/api/finance/money-flow/route.ts  (combined, deferred)
```

All additive. No existing files modified. No UI. No portfolio data.

---

## Rollback path

Delete the new files. Nothing else is touched.
