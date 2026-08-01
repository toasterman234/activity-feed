# Hedge Engine Integration Audit

**Date:** 2026-08-01  
**Scope:** Activity Dashboard personal page + portfolio/trading/research tabs  
**Status:** Read-only audit — no code changes, no DB migrations, no new deps

---

## Executive Summary

The Activity Dashboard (`dashboard/`) is a Next.js App Router PWA with live Electric Circuits sync from PostgreSQL. Portfolio data flows from a Life OS analytical DuckDB into PostgreSQL via an hourly Python ingestion script. Market data (quotes, option chains, fundamentals, VRP scans) comes from a separate Market Lake Python API on :9077.

The portfolio-hedge-lab repo (`Meseverri/portfolio-hedge-lab` on GitHub) is an academic backtest pipeline — a single 110k-line Python file that runs Markowitz + equiweight portfolios with option hedging from scratch. It has no FastAPI, no database, no web frontend, and **no reusable integration surface** as-is.

**Key finding:** There is no existing job queue, worker pool, Dagu, iii Harness, or general-purpose async compute infrastructure. The system runs on LaunchAgents (macOS launchd) and a single OVH VPS. Building a hedge engine here means building from scratch, not integrating into an existing pipeline.

**Recommended architecture:** **Option E (Hybrid)** — a dedicated headless Python service (new) that exposes a simple REST API, uses the existing PostgreSQL database (read-only on portfolio tables, read/write on a new `hedge` schema), and submits long-running computation jobs to a lightweight worker backed by the PostgreSQL queue (same DB, no new infrastructure).

---

## Answers to the 17 Required Questions

### 1. What is the canonical portfolio source of truth?

**Life OS analytical DuckDB** at `~/.life/analytical/footprint.duckdb`. Views: `finance.positions`, `finance.trades`, `finance.balances`, `finance.net_worth_daily`, `finance.benchmarks`, `finance.v_allocation`.

This is synced hourly to PostgreSQL via `dashboard/ingestion/sync_lifeos_to_pg.py`, which feeds the Electric Circuits live sync for the PWA dashboard.

### 2. Which existing tables and APIs should the hedge engine use?

**Tables (read-only):**
- `portfolio_positions` — current holdings with symbol, qty, price, market_value, asset_class, institution, account_name, account_kind, position_kind
- `portfolio_trades` — full trade history with option-specific fields (is_option, option_type, option_strike, option_expiry)
- `portfolio_benches` — historical benchmark closes

**API endpoints:**
- Market Lake `/live/quotes` — real-time prices
- Market Lake `/live/option-chain/{symbol}` — live option chains with Greeks
- Market Lake `/prices/historical/{symbol}` — daily bars for backtesting
- Market Lake `/fundamentals/{symbol}` — fundamental snapshots
- Market Lake `/symbol/{symbol}/vrp/latest` — volatility/VARP data
- Market Lake `/vrp/scan` — volatility scan
- Market Lake `/scan/unified` — unified scanner

### 3. Should the hedge engine read the database directly or consume an API snapshot?

**Both.** For the immutable snapshot contract: direct PostgreSQL read (same DB, separate schema). For live market data during hedge computation: Market Lake REST API. The snapshot is a point-in-time freeze of portfolio state; Greeks and option chains are fetched fresh during analysis.

### 4. What exact portfolio snapshot contract should be used?

See [`portfolio-snapshot-contract.json`](./portfolio-snapshot-contract.json) and [`portfolio-snapshot-field-map.md`](./portfolio-snapshot-field-map.md).

### 5. Which existing analytics can be reused?

| Analytic | File | Reuse? | Note |
|---|---|---|---|
| Greek aggregation | `src/lib/portfolio-analytics/greek-aggregation.ts` | **Indirect** | Logic is correct but TypeScript. Hedge engine reimplements in Python. |
| Income metrics | `src/lib/portfolio-analytics/income.ts` | **No** | Purely dashboard display; hedge engine does not compute income. |
| Risk composite | `src/lib/portfolio-analytics/risk.ts` | **No** | Different risk model — hedge engine needs its own risk scoring for hedge candidates. |
| Scenario engine | `src/lib/portfolio-analytics/scenarios.ts` | **Indirect** | Delta-gamma-theta-vega approximation is the correct model. Reimplement in Python for the hedge engine. |
| MetricCard | `src/lib/portfolio-analytics/metric-card.ts` | **No** | Dashboard UI concern only. |
| Trade risk analysis | `src/app/finance/trade-lab-model.ts` | **No** | Single-contract analysis for the Trade Lab sheet. |
| Portfolio risk snapshot | `src/app/finance/portfolio-risk-model.ts` | **Partial** | The `PortfolioRiskSnapshot` type and beta-weighted exposure logic are useful. |

### 6. What data required by Phases 3–6 is currently missing?

**Critical gaps:**
- **Historical option chains** — Market Lake provides live chains only. No historical strikes, bids, asks, or Greeks.
- **Historical option settlement prices** — Not available.
- **Option contract specifications** — Multiplier, exercise style (American/European) not surfaced in the API.
- **Corporate actions** — Not in Market Lake (yfinance in hedge-lab, but unreliable).
- **Interest rates / yield curve** — Not in Market Lake. Hedge-lab uses FRED DGS1MO.
- **VIX historical** — Market Lake may have it via `/prices/historical/^VIX`; unverified.
- **Dividend history per symbol** — `/dividends/profile/{symbol}` provides yield only, not payment dates/amounts.

**Available:**
- Live option chains with full Greeks ✓
- Equity/ETF daily bars ✓
- Fundamental snapshots ✓
- VRP/composite scores ✓
- Live quotes (bid/ask/last) ✓

### 7. Is historical option-chain data already available?

**No.** Market Lake provides live option chains only. The hedge-lab repo uses theoretical BSM pricing with VIX as vol proxy — it does not use historical option chains.

### 8. How are current option positions represented?

**Derived from trade history, not stored as positions.** The `portfolio_positions` table has NO option-specific columns (no option_type, option_strike, option_expiry). Option open interest is computed by netting trades in `use-option-greeks.ts`:

```typescript
// In use-option-greeks.ts:
// 1. Filter trades where is_option = true
// 2. Net by contract key: symbol|type|strike|expiry
// 3. Return contracts with quantity != 0
```

Greek data for those contracts is fetched live from Market Lake option chains, matched by strike + type.

**Quality:** This works for the dashboard but is fragile for a hedge engine. Option positions should be materialized into a dedicated table (e.g., `portfolio_option_positions`) rather than recomputed from trade history every time.

### 9. Which parts of the current Portfolio Hedge Lab repo should survive?

**Almost nothing can be reused directly.** The repo is an academic pipeline, not an integration-ready service. It:
- Reads ticker data from yfinance (not our DB)
- Computes Markowitz/equiweight portfolios from scratch (not our holdings)
- Uses BSM theoretical pricing with VIX (not real market option chains)
- Outputs Excel files (not API responses)

**What IS reusable:**
- **BSM pricing module:** the BSM formulas, Greeks computation, and delta calculations are mathematically correct and can be extracted.
- **Hedge ratio (beta rolling):** the 36-month rolling beta vs benchmark is useful for determining hedge sizing.
- **Methodology documentation:** `docs/METODOLOGIA.md` is thorough and academically sound.
- **Config model:** the config.json pattern for parameterizing runs is a good pattern for the hedge engine.

### 10. Which parts should be discarded or separated?

- The entire Next.js frontend (duplicate of our dashboard)
- Markowitz optimizer (we don't need portfolio construction)
- Equiweight portfolio logic (we have actual holdings)
- yfinance data download pipeline (we have Market Lake)
- Excel output generation (we need API results + DB storage)
- The 110k-line monolithic `quant_pipeline.py` (needs modular decomposition regardless)

### 11. What is the recommended integration architecture?

**Option E (Hybrid):**

```
Activity Dashboard (Next.js PWA)
    │
    ├─ Electric Circuits (live sync)
    │     └─ PostgreSQL (activity_log)
    │           ├─ portfolio_* tables (read)
    │           └─ hedge.* tables (new, write)
    │
    ├─ Market Lake API (:9077)
    │     └─ Live quotes, option chains, historical prices, fundamentals
    │
    └─ Hedge API Service (new, Python/FastAPI)
          ├─ POST /hedge/runs — submit hedge scan
          ├─ GET  /hedge/runs/{id} — check status
          ├─ GET  /hedge/runs/{id}/results — fetch results
          ├─ POST /hedge/assumptions — manage assumption sets
          └─ GET  /hedge/candidates/{runId} — browse candidates
                │
                └─ Workers (new, Python, same process or child)
                      ├─ Candidate scanner
                      ├─ Combination optimizer
                      ├─ Rolling simulation
                      └─ Walk-forward validation
```

**Why this over other options:**

- **Option A (internal package):** No. Calculations are in Python (quant ecosystem), dashboard is TypeScript. Would require Pyodide/WASM or a Node child process — both fragile.
- **Option B (separate service):** Yes for the API layer, but needs a worker for long-running computation.
- **Option C (worker-based):** There's no existing queue. Adding Redis/RabbitMQ is unnecessary complexity. A PostgreSQL-backed job table is sufficient.
- **Option D (iii Harness):** No iii Harness infrastructure exists in this repo. Don't build one for this.
- **Option E (Hybrid):** FastAPI service + PostgreSQL-based job queue + same-database storage. Lowest operational complexity, clear data ownership.

### 12. Where should long-running jobs execute?

In the **Hedge API Service process** (Python), using a simple PostgreSQL-backed job table:

```sql
CREATE TABLE hedge.jobs (
    id UUID PRIMARY KEY,
    run_id UUID REFERENCES hedge.runs(id),
    job_type TEXT, -- 'scan', 'optimize', 'simulate', 'validate'
    status TEXT,   -- 'pending', 'running', 'complete', 'failed'
    params JSONB,
    result JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT
);
```

A worker loop in the same FastAPI process polls this table. No separate queue infrastructure. This is adequate for single-user hedge analysis (minutes-long runs, not thousands of concurrent jobs).

### 13. Where should hedge results be stored?

In a **dedicated PostgreSQL schema** (`hedge`) within the existing `activity_log` database. This avoids a new database while keeping clear ownership boundaries. See the schema recommendations in Section 8.

Large timeseries (scenario grids, rolling results) should use PostgreSQL `JSONB` columns initially. If data volume grows beyond ~100MB, move to Parquet files on the filesystem or object storage.

### 14. How should the current frontend consume results?

Add a **"Hedges" tab** to the `/personal` page, alongside Portfolio, Flow, Personal, Watchlist, Screener, Analytics:

```
Personal page tabs:
  Portfolio | Flow | Personal | Watchlist | Screener | Analytics | Hedges
```

Add a **desktop sidebar** entry (`/desktop/hedges`).

The Hedges view would consume results via the Hedge API proxy (through Next.js rewrites, same pattern as Market Lake):

```typescript
// src/lib/hedge-api.ts
const HEDGE_API = "/hedge-api";  // proxied in next.config.ts
```

Reuse existing components: card layouts, tables, Recharts charts, async polling patterns (from `useOptionGreeks`).

### 15. What are the five largest integration risks?

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **No historical option-chain data** | High | Critical | Implement BSM theoretical pricing as fallback (reuse hedge-lab's BSM module). Accept that results will be theoretical, not market-observed. |
| 2 | **Option positions not materialized** | Medium | High | Materialize `portfolio_option_positions` from trade netting before building the hedge engine. Required prerequisite. |
| 3 | **Single-machine deployment** | Medium | Medium | Hedge computation runs on the same VPS as the dashboard. Resource contention if scans run during market hours. Schedule scans during off-hours initially. |
| 4 | **Data quality of trade history** | Medium | Medium | Trade history may have gaps, duplicates, or incorrect option symbols. Must validate before relying on it for hedge analysis. |
| 5 | **Scope creep from hedge-lab repo expectations** | Low | High | The hedge-lab repo is an academic backtest, not a production engine. It should be treated as a reference library for formulas, not a template for the service. |

### 16. What must be completed before Phase 3 can begin?

1. **Materialize option positions:** Create `portfolio_option_positions` table populated from trade netting. This must exist before the hedge engine can snapshot portfolio state.
2. **Stand up the Hedge API service scaffolding:** FastAPI app, PostgreSQL connection, health endpoint, Dockerfile.
3. **Create the `hedge` PostgreSQL schema:** Tables for runs, candidates, results.
4. **Implement the BSM pricing module:** Extracted from hedge-lab's `quant_pipeline.py`, adapted to our data sources.
5. **Build the portfolio snapshot endpoint:** `GET /hedge/snapshot` — reads from `portfolio_positions` + `portfolio_option_positions` + `portfolio_trades`, returns the immutable contract.
6. **Add proxy rewrite to Next.js:** `/hedge-api → http://127.0.0.1:9080` (or wherever the Hedge API runs).

### 17. What is the exact implementation order after the audit?

See [`hedge-integration-plan.md`](./hedge-integration-plan.md).

---

## System Inventory

| Component | Technology | Purpose | Owner | Data Read | Data Written | Reuse Status |
|---|---|---|---|---|---|---|
| Dashboard PWA | Next.js 16, React 19 | Portfolio UI, analytics, trading | Dashboard | Electric shapes, Market Lake | None (read-only UI) | Keep |
| Electric Circuits | tRPC + durable-streams | Live PostgreSQL sync to UI | Dashboard | PostgreSQL WAL | WebSocket push | Keep |
| PostgreSQL | PostgreSQL 16 | Sync target for portfolio data | Life OS ingestion | WAL | Tables | Keep |
| Life OS DuckDB | DuckDB | Analytical data warehouse | Life OS | CSV, APIs | Views | Keep (source of truth) |
| sync_lifeos_to_pg.py | Python | DuckDB → PG ETL | Ingestion | DuckDB views | PG tables | Keep |
| Market Lake API | Python/FastAPI | Market data (quotes, chains, fundamentals) | Market Lake | Polygon.io, Tradier, yfinance | JSON API | Keep |
| portfolio-analytics lib | TypeScript | Client-side portfolio math | Dashboard | Normalized positions | MetricCards | Keep (UI layer) |
| trade-lab-model.ts | TypeScript | Single-contract risk analysis | Dashboard | Contract + inputs | TradeRisk | Keep |
| portfolio-risk-model.ts | TypeScript | Portfolio risk snapshot for trades | Dashboard | Positions + trade | PortfolioRiskSnapshot | Keep |
| LaunchAgents | macOS launchd | Scheduled ingestion tasks | macOS | N/A | Process lifecycle | Keep |
| portfolio-hedge-lab repo | Python | Academic backtest pipeline | GitHub (Meseverri) | yfinance | Excel files | Extract BSM module only |

---

## Database Inventory

| Database | Schema | Object | Purpose | Canonical/Derived | Update Cadence | Hedge Relevance |
|---|---|---|---|---|---|---|
| PostgreSQL (activity_log) | public | portfolio_positions | Current holdings | Derived (from DuckDB) | Hourly | **High** — snapshot source |
| PostgreSQL | public | portfolio_trades | Full trade history | Derived | Hourly | **High** — option netting |
| PostgreSQL | public | portfolio_balances | Cash balances | Derived | Hourly | Medium |
| PostgreSQL | public | portfolio_net_worth | Daily net worth history | Derived | Hourly | Low |
| PostgreSQL | public | portfolio_benches | Benchmark closes | Derived | Hourly | **High** — beta calculation |
| PostgreSQL | public | portfolio_allocation | Asset allocation | Derived | Hourly | Low |
| DuckDB (Life OS) | finance | positions | Raw positions by account | **Canonical** | Daily (broker sync) | **High** |
| DuckDB | finance | trades | Raw trades by account | **Canonical** | Daily | **High** |
| DuckDB | finance | balances | Account balances | **Canonical** | Daily | Medium |
| DuckDB | finance | net_worth_daily | Daily net worth history | **Canonical** | Daily | Low |
| DuckDB | finance | benchmarks | Benchmark prices | **Canonical** | Daily | **High** |

---

## Analytics Inventory

| Metric | Implementation | Inputs | Output | Validated | Reusable | Gap |
|---|---|---|---|---|---|---|
| Portfolio Greeks | `greek-aggregation.ts` | Positions + option Greeks | AggregatedGreeks | Yes (Vitest) | Reimplement in Python | None |
| Income metrics | `income.ts` | Greeks + trades + positions | IncomeMetrics | Yes | No (UI only) | N/A |
| Risk composite | `risk.ts` | 7 risk scores | CompositeRiskStatus | Yes | Reimplement for hedge scoring | Hedge-specific scoring needed |
| Concentration | `risk.ts:computeConcentrationBreakdown` | Positions + sectors | ConcentrationBreakdown | Yes | Reuse logic | None |
| Expiration risk | `risk.ts:computeExpirationRisk` | Positions + Greeks | ExpirationBucket[] | Yes | Reuse logic | None |
| Assignment risk | `risk.ts:computeAssignmentRisks` | Positions + prices | AssignmentRisk[] | Yes | Reuse logic | None |
| Buying power | `risk.ts:computeBuyingPower` | Positions + cash | BuyingPowerAnalysis | Yes | Reuse logic | None |
| Stress tests | `scenarios.ts` | Greeks + prices | StressTestGrid | Yes | Reimplement in Python | 16 scenarios only |
| Correlation | `risk.ts:identifyCorrelationGroups` | Positions | CorrelationGroup[] | Partial (keyword-based) | Weak — needs real correlation data | No correlation matrix |
| Trade risk | `trade-lab-model.ts` | Contract + inputs | TradeRisk | Manual | No (single-contract) | N/A |
| Portfolio risk snap | `portfolio-risk-model.ts` | Positions + trade | PortfolioRiskSnapshot | Manual | Partial — beta-weighted exposure useful | Incomplete for options |

---

## Data Source Inventory

| Data Type | Provider | Historical Depth | Frequency | Stored/Fetched | Phase 3 | Phase 5 |
|---|---|---|---|---|---|---|
| Equity prices (live) | Polygon.io → Market Lake | N/A | Real-time | Fetched | ✓ | ✗ |
| Equity prices (historical) | Polygon.io → Market Lake | ~10 years | Daily | Cached (Parquet) | ✓ | ✓ |
| Option chains (live) | Tradier → Market Lake | Live only | On demand | Fetched | ✓ | ✗ |
| Option chains (historical) | **None** | **Missing** | **Missing** | **Missing** | ✗ | **✗ Critical** |
| Fundamentals | Polygon.io → Market Lake | Current snapshot | On demand | Cached | ✓ | ✗ |
| VRP/vol data | Market Lake computed | Rolling 252d | Daily | Cached | ✓ | ✓ |
| VIX | Market Lake (unverified) | Unknown | Daily | Cached | ✓ | ✓ |
| Interest rates | FRED (in hedge-lab, not Market Lake) | 10+ years | Daily | Fetched | ✗ | ✗ |
| Dividends | Market Lake `/dividends` | Yield only | On demand | Fetched | Partial | ✗ |
| Corporate actions | **None** | **Missing** | **Missing** | **Missing** | ✗ | ✗ |

---

## Architecture Comparison

| Option | Advantages | Disadvantages | Complexity | Ops Impact | Recommendation |
|---|---|---|---|---|---|
| A: Internal package | No new service | Python/TS boundary, no long-running jobs | Low | Low | **Reject** — wrong language for quant |
| B: Separate service | Clean boundaries | Needs API + deployment | Medium | Medium | Partial — needs worker for long jobs |
| C: Worker-based | Excellent for async | No existing queue infra | High | High | Partial — overkill for single-user |
| D: iii Harness | Workflow visibility | Doesn't exist here; LLM ≠ numerical | Very High | Very High | **Reject** — wrong tool for quant |
| **E: Hybrid** | **Right-sized, clear ownership** | **2 new processes (API + worker)** | **Medium** | **Medium** | **Select** |

---

## Risk Register

| Risk | Likelihood | Impact | Evidence | Mitigation | Blocking |
|---|---|---|---|---|---|
| No historical option chains | High | Critical | Market Lake `/live/option-chain` is live-only | BSM theoretical pricing with VIX | Yes — limits Phase 5 accuracy |
| Option positions not materialized | Medium | High | `portfolio_positions` has no option columns | Materialize `portfolio_option_positions` | Yes — prerequisite |
| Single-point deployment | Medium | Medium | Dashboard + Market Lake on same VPS | Off-hours scheduling | No |
| Trade data quality | Medium | Medium | Trade history completeness unverified | Validate before Phase 3 | No |
| Hedge-lab is academic | Low | High | 110k-line monolith, Excel output | Treat as formula reference only | No |
| No corporate actions data | Medium | Medium | Not in Market Lake or Life OS | Accept limitation; document assumption | No |
| No yield curve data | Medium | Medium | Only DGS1MO in hedge-lab via FRED | Add FRED DGS* series to Market Lake | No |

---

*This audit was conducted via static code inspection of the dashboard source, ingestion scripts, Market Lake API client, and the GitHub portfolio-hedge-lab repository. No databases were connected to directly; all schema information comes from the TypeScript schema definition and the ingestion script's CREATE TABLE statements.*
