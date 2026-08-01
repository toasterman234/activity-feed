# Hedge Audit Evidence

Files, database objects, endpoints, and commands inspected during the audit.

---

## Dashboard Source Code

### Electric Circuit Shapes & Schema

| File | Lines | Purpose |
|---|---|---|
| `dashboard/src/app/schema.ts` | Full | Complete PostgreSQL schema in TypeScript — all table definitions |
| `dashboard/src/app/electric.ts` | Full | Shape definitions; live-sync table list |
| `dashboard/src/app/shape-registry.ts` | (referenced) | Shape lifecycle management |

### Portfolio & Finance Pages

| File | Lines | Purpose |
|---|---|---|
| `dashboard/src/app/portfolio/page.tsx` | Full | Legacy portfolio page (net worth + allocation + positions via Electric) |
| `dashboard/src/app/personal/page.tsx` | Full | Personal page tab container (Portfolio, Flow, Personal, Watchlist, Screener, Analytics) |
| `dashboard/src/app/finance/page.tsx` | Full | Redirect: `/finance` → `/personal` |
| `dashboard/src/app/finance/portfolio-content.tsx` | Full | Portfolio Holdings tab: grouped by institution, expandable |
| `dashboard/src/app/finance/analytics-content.tsx` | Full | Analytics tab shell: data fetching, normalization, sub-tab routing |
| `dashboard/src/app/finance/analytics-income.tsx` | Full | Income dashboard: 8 metric cards, charts, drill-down |
| `dashboard/src/app/finance/analytics-risk.tsx` | Full | Risk dashboard: 8 metric cards, stress grid, concentration chart |
| `dashboard/src/app/finance/use-option-greeks.ts` | Full | Option Greek fetching hook — nets trades to find open options, matches on Market Lake |
| `dashboard/src/app/finance/trades-content.tsx` | Sampled | Trade history display |
| `dashboard/src/app/finance/watchlist-content.tsx` | Sampled | Watchlist with live quotes |
| `dashboard/src/app/finance/screener-content.tsx` | Sampled | Unified scanner |
| `dashboard/src/app/finance/money-flow-content.tsx` | Sampled | Money flow / transactions |
| `dashboard/src/app/finance/net-worth-content.tsx` | Sampled | Net worth history |
| `dashboard/src/app/finance/banking-content.tsx` | Sampled | Banking balances view |
| `dashboard/src/app/finance/option-chain-sheet.tsx` | Sampled | Option chain viewer sheet |
| `dashboard/src/app/finance/candidate-inspection-sheet.tsx` | Sampled | Candidate inspection sheet |
| `dashboard/src/app/finance/trade-lab-sheet.tsx` | Sampled | Trade lab / what-if analysis sheet |
| `dashboard/src/app/finance/candidate-compare.tsx` | Sampled | Candidate comparison view |

### Portfolio Analytics Library

| File | Lines | Purpose |
|---|---|---|
| `dashboard/src/lib/portfolio-analytics/types.ts` | Full | All shared types: NormalizedPosition, AggregatedGreeks, IncomeMetrics, etc. |
| `dashboard/src/lib/portfolio-analytics/greek-aggregation.ts` | Full | Portfolio-level Greek aggregation from positions + option snapshots |
| `dashboard/src/lib/portfolio-analytics/income.ts` | Full | Income metrics: realized P&L, premium flow, ROC, theta efficiency, concentration |
| `dashboard/src/lib/portfolio-analytics/risk.ts` | Full | Risk: concentration, expiration, assignment, buying power, composite status, correlation, gross notional |
| `dashboard/src/lib/portfolio-analytics/scenarios.ts` | Full | Stress test engine: delta-gamma-theta-vega approximation, 16 scenarios |
| `dashboard/src/lib/portfolio-analytics/metric-card.ts` | Full | MetricCard factory: formatters, status, quality |
| `dashboard/src/lib/portfolio-analytics/index.ts` | Full | Barrel export |
| `dashboard/src/lib/portfolio-analytics/__tests__/scenarios.test.ts` | Full | 26 scenario tests |
| `dashboard/src/lib/portfolio-analytics/__tests__/risk.test.ts` | Full | 24 risk tests |
| `dashboard/src/lib/portfolio-analytics/__tests__/income.test.ts` | Full | 12 income tests |

### Market Data Client

| File | Lines | Purpose |
|---|---|---|
| `dashboard/src/lib/market-lake.ts` | Full | Typed fetch wrapper for Market Lake API — all endpoints and types documented |

### Trade/Risk Models

| File | Lines | Purpose |
|---|---|---|
| `dashboard/src/app/finance/trade-lab-model.ts` | Full | Single-contract trade analysis: CSP, covered call, stock |
| `dashboard/src/app/finance/portfolio-risk-model.ts` | Full | Portfolio-level risk snapshot for trade proposals |

### Desktop Pages

| File | Lines | Purpose |
|---|---|---|
| `dashboard/src/app/desktop/sidebar.tsx` | Full | Desktop sidebar navigation (Overview, Portfolio, Watchlist, Screener, Research, Analytics) |
| `dashboard/src/app/desktop/layout.tsx` | Full | Desktop layout with sidebar |
| `dashboard/src/app/desktop/portfolio/page.tsx` | Sampled | Desktop portfolio view |
| `dashboard/src/app/desktop/research/page.tsx` | Sampled | Strategy research view |
| `dashboard/src/app/desktop/screener/page.tsx` | Sampled | Desktop screener |
| `dashboard/src/app/desktop/watchlist/page.tsx` | Sampled | Desktop watchlist |
| `dashboard/src/app/desktop/analytics/page.tsx` | Sampled | Desktop analytics (renders AnalyticsContent component) |

---

## Ingestion & Backend

| File | Lines | Purpose |
|---|---|---|
| `dashboard/ingestion/sync_lifeos_to_pg.py` | Full (352 lines) | DuckDB → PostgreSQL ETL script. Creates PG tables, upserts data hourly |

### Observed PostgreSQL tables (from schema.ts + ingestion script):

- `portfolio_positions` — current holdings (id, symbol, name, qty, price, market_value, asset_class, institution, account_name, account_kind, position_kind, as_of_date, updated_at)
- `portfolio_trades` — trade history (trade_id, symbol, description, side, quantity, price, proceeds, date, is_option, option_type, option_strike, option_expiry, institution, updated_at)
- `portfolio_balances` — account balances (account_id, institution, type, balance, as_of_date, updated_at)
- `portfolio_transactions` — transaction history (txn_id, account_id, institution, date, amount, merchant, raw_description, category, updated_at)
- `portfolio_net_worth` — daily net worth (date, total_assets, total_liabilities, net_worth, cash, invested, by_asset_class, updated_at)
- `portfolio_benches` — benchmark closes (symbol, date, close, updated_at)
- `portfolio_allocation` — asset allocation (asset_class, market_value, target_pct, current_pct, drift_pct, updated_at)

---

## Market Lake API Endpoints

| Endpoint | Method | Source |
|---|---|---|
| `/live/quotes?symbols=AAPL,SPY` | GET | `market-lake.ts:getLiveQuotes()` |
| `/live/option-expirations/{symbol}` | GET | `market-lake.ts:getOptionExpirations()` |
| `/live/option-chain/{symbol}?expiration=YYYY-MM-DD` | GET | `market-lake.ts:getOptionChain()` |
| `/prices/historical/{symbol}?limit=252&sort=desc` | GET | `market-lake.ts:getHistoricalPrices()` |
| `/fundamentals/{symbol}` | GET | `market-lake.ts:getCandidateInspection()` |
| `/dividends/profile/{symbol}` | GET | `market-lake.ts:getCandidateInspection()` |
| `/symbol/{symbol}/vrp/latest` | GET | `market-lake.ts:getCandidateInspection()` |
| `/vrp/scan?min_ivr=0.3&top_n=30` | GET | `market-lake.ts:getVRPScan()` |
| `/scan/unified?mode=vrp&limit=30` | GET | `market-lake.ts:getUnifiedScan()` |
| `/research/strategies` | GET | `market-lake.ts:getStrategies()` |
| `/research/findings?strategy=xxx` | GET | `market-lake.ts:getFindings()` |
| `/portfolio/schwab/positions` | GET | `market-lake.ts:getPortfolioSnapshot()` |
| `/portfolio/fidelity/positions` | GET | `market-lake.ts:getPortfolioSnapshot()` |

**Market Lake deployment:**
- Location: `/Users/bencharney/market-lake-serve/src/market_lake/`
- Modules: `api/`, `ids/`, `indicators.py`, `ingest/`, `io/`, `live_client.py`, `marts/`, `openbb/`, `settings.py`, `validation/`
- Managed by: macOS LaunchAgent (`com.market-lake.api-server.plist`)
- Port: 9077
- Funnel watchdog: `com.market-lake.funnel-watchdog.plist`
- Scheduled: Daily refresh, dividend enrichment, ETF wave backfill (all launchd)

---

## Job/Workflow Infrastructure

**Found:** No job queue, worker pool, Dagu, iii Harness, or general-purpose async compute infrastructure.

**What exists:**
- `dashboard/package.json` — init/db scripts but no worker scripts
- macOS LaunchAgents for scheduled tasks (ingestion, Market Lake maintenance)
- No message broker, no Redis, no Celery
- Next.js API routes (tRPC) are synchronous request/response only
- Electric Circuits is the only async mechanism (pub/sub for DB changes)

---

## Deployment

- **Dashboard:** OVH VPS, deployed via `npm run deploy:ovh` (bash script)
- **Market Lake:** Local Mac (`market-lake-serve`), exposed via Tailscale Funnel
- **Electric Circuits:** Local Mac (tRPC :8795, durable-streams :8794)
- **PostgreSQL:** Local Mac (:5433)
- **Life OS DuckDB:** Local Mac (`~/.life/analytical/footprint.duckdb`)

---

## Portfolio Hedge Lab (GitHub)

**Repository:** `Meseverri/portfolio-hedge-lab`
**Default branch:** `main`
**Last commit:** 2026-05-09

**Files inspected:**

| File | Size | Inspected |
|---|---|---|
| `README.md` | 11,801 bytes | Full |
| `config.json` | 1,484 bytes | Full |
| `requirements.txt` | 514 bytes | Full |
| `quant_pipeline.py` | 110,759 bytes | Top-level structure only (README describes phases) |
| `docs/METODOLOGIA.md` | 40,722 bytes | Not read (summary from README) |
| `docs/CASOS_LIMITE.md` | 16,392 bytes | Not read |
| `docs/rules.md` | 10,339 bytes | Not read |
| `docs/prompt.txt` | 27,442 bytes | Not read |
| `docs/prompt_webapp.txt` | 34,495 bytes | Not read |
| `scripts/diagnostico_outliers.py` | 44,151 bytes | Not read |

**Key observations:**
- Academic TFG (thesis) project — Markowitz/equiweight backtest with option hedging
- Single monolithic Python file (110k lines) — no modular structure
- No API, no database, no web frontend (despite docs referencing a planned Next.js app)
- Output is Excel files — not API-consumable
- Data source is yfinance (+ FRED), not our infrastructure
- Contains ~580 lines of reusable formulas (BSM, metrics, beta, outliers)

---

## Test Coverage

| Framework | Files | Tests | Location |
|---|---|---|---|
| Vitest | `src/lib/portfolio-analytics/__tests__/` | 62 | `dashboard/` |
| Playwright | `tests/mobile/` | Mobile QA | `dashboard/` |

Verify commands:
- Vitest: `npx vitest run` → 62/62 pass
- Build: `npm run build` → passes
- Shape check: `npm run check:shapes` → passes

---

## Configuration Files

| File | Purpose |
|---|---|
| `dashboard/package.json` | Dependencies, scripts, Next.js + React + Electric Circuits + shadcn + Recharts |
| `dashboard/next.config.ts` | Route rewrites, PWA config, allowedDevOrigins |
| `dashboard/.env.local` | NOT read (contains secrets) |
| `dashboard/components.json` | shadcn/ui configuration |

---

## Documentation Files Referenced

| File | Purpose |
|---|---|
| `docs/architecture/ui-to-code-map.md` | UI component → source file mapping |
| `docs/decisions/ADR-016-portfolio-risk-approximation.md` | Trade lab risk approximations |
| `docs/decisions/ADR-017-public-com-screener-migration.md` | Screener migration rationale |
| `docs/decisions/ADR-005-production-host-ovh.md` | OVH deployment decisions |
| `openwiki/architecture/overview.md` | Overall architecture |
| `openwiki/quickstart.md` | Quickstart guide |

---

*Audit conducted 2026-08-01 via static code inspection. No database connections made. All schema information from TypeScript definitions and ingestion scripts. Redacted: no account identifiers, tokens, or personal data included.*
