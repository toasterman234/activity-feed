# Portfolio Snapshot Field Map

Maps every field in the hedge engine's immutable portfolio snapshot contract to existing data sources in the Activity Dashboard system.

## Top-level fields

| Target Field | Existing Source | Existing Table/Endpoint | Transformation | Availability | Data Quality Concerns |
|---|---|---|---|---|---|
| `portfolio_id` | Life OS | DuckDB finance.positions | MD5 hash of account group IDs | Synthetic — generate at snapshot time | Not a real UUID; deterministic hash of positions is fine |
| `snapshot_id` | New | Generated | UUIDv4 at snapshot creation | Available | New field |
| `valuation_time` | System clock | Python `datetime.utcnow()` | ISO-8601 with timezone | Available | Ensure UTC |
| `base_currency` | Hardcoded | N/A | Always "USD" | Available | No multi-currency support |
| `total_value` | Computed | `SUM(market_value)` from portfolio_positions | Sum of all position market values + cash | Available | Excludes non-brokerage assets (real estate, private) |
| `cash_value` | portfolio_balances | `SUM(balance) WHERE type IN ('checking','savings','brokerage_cash')` | Sum of cash balances | Available | May include non-investable cash |
| `benchmark` | Hardcoded | N/A | Always "SPY" for now | Available | User-configurable in future |

## Position fields

| Target Field | Existing Source | Existing Table/Endpoint | Transformation | Availability | Data Quality Concerns |
|---|---|---|---|---|---|
| `position_id` | portfolio_positions.id | `portfolio_positions` | Direct read | Available | Composite key: `institution:account:type:symbol` |
| `symbol` | portfolio_positions.symbol | `portfolio_positions` | Direct read | Available | Option symbols in OCC format or broker format |
| `asset_type` | Derived | `portfolio_positions.asset_class` | Map: equity→"equity", crypto→"crypto", cash_equivalent→"cash" | Available | No "option" rows in portfolio_positions — must join with option netting |
| `quantity` | portfolio_positions.qty | `portfolio_positions` | Direct read (stocks/crypto); from trade netting (options) | Available | Option quantity from trade netting may drift if trades are missing |
| `market_price` | portfolio_positions.price | `portfolio_positions` | Direct read | Available | Last sync price, may be stale |
| `market_value` | portfolio_positions.market_value | `portfolio_positions` | Direct read | Available | Computed as qty × price |
| `cost_basis` | NOT AVAILABLE | N/A | **Missing** — not stored in portfolio_positions | **Missing** | Would need trade history aggregation |
| `unrealized_pnl` | NOT AVAILABLE | N/A | **Missing** — computed on the fly in UI | **Missing** | Would need cost_basis + market_value |
| `currency` | Hardcoded | N/A | Always "USD" | Available | No FX positions |
| `sector` | NOT IN PORTFOLIO_POSITIONS | Market Lake `/fundamentals/{symbol}` or `sector-rs.ts` | Fetch from Market Lake per symbol | Available with API call | Sectors change over time; use snapshot-time sector |
| `account_id` | portfolio_positions.id prefix | `portfolio_positions` | Extract from composite key | Available | Redact in external reports |
| `institution` | portfolio_positions.institution | `portfolio_positions` | Direct read | Available | |
| `option` | **NOT IN portfolio_positions** | Trade netting + Market Lake option chain | Complex: 1) net trades to find open options, 2) fetch live Greeks from Market Lake | **Available with work** | **CRITICAL: must materialize before Phase 3** |
| `metadata.source` | Hardcoded per table | N/A | String literal | Available | |

## Option-specific fields (within position.option)

| Target Field | Existing Source | Existing Table/Endpoint | Transformation | Availability | Data Quality Concerns |
|---|---|---|---|---|---|
| `underlying` | Derived from option symbol | Option symbol parsing (AAPL250117P00180000 → AAPL) | Regex `/^([A-Z]+)\d{6}/` | Available | Fragile — depends on symbol format consistency |
| `expiration` | portfolio_trades.option_expiry | `portfolio_trades` | From trade netting | Available | Depends on complete trade history |
| `strike` | portfolio_trades.option_strike | `portfolio_trades` | From trade netting | Available | |
| `option_type` | portfolio_trades.option_type | `portfolio_trades` | lowercase: "PUT"→"put", "CALL"→"call" | Available | |
| `side` | Derived from net quantity | Trade netting result | quantity < 0 → "short", > 0 → "long" | Available | |
| `multiplier` | Hardcoded | N/A | Always 100 for US equity options | Available | May differ for non-standard options |
| `exercise_style` | NOT AVAILABLE | N/A | **Missing** — need spec database or hardcode "american" | **Missing** | All common US equity options are American |
| `current_price` | Market Lake option chain | `/live/option-chain/{underlying}` | Match by strike + type + expiration | Available (live fetch) | Only available during market hours |
| `bid` | Market Lake option chain | `/live/option-chain/{underlying}` | Match by strike + type + expiration | Available (live fetch) | |
| `ask` | Market Lake option chain | `/live/option-chain/{underlying}` | Match by strike + type + expiration | Available (live fetch) | |
| `implied_volatility` | Market Lake option chain | `/live/option-chain/{underlying}` | Match by strike + type + expiration | Available (live fetch) | |
| `delta` | Market Lake option chain | `/live/option-chain/{underlying}` | Contract delta (not position-signed) | Available (live fetch) | Position-signed delta = contract delta × qty × 100 |
| `gamma` | Market Lake option chain | `/live/option-chain/{underlying}` | Contract gamma | Available (live fetch) | |
| `vega` | Market Lake option chain | `/live/option-chain/{underlying}` | Contract vega | Available (live fetch) | |
| `theta` | Market Lake option chain | `/live/option-chain/{underlying}` | Contract theta | Available (live fetch) | |
| `open_interest` | Market Lake option chain | `/live/option-chain/{underlying}` | Direct | Available (live fetch) | |
| `volume` | Market Lake option chain | `/live/option-chain/{underlying}` | Direct | Available (live fetch) | |
| `greeks_source` | Hardcoded | N/A | "market-lake" or "bsm-estimated" | Available | |
| `greeks_timestamp` | Market Lake option chain | Timestamp in API response | ISO-8601 | Available | |

## Existing metrics fields

| Target Field | Existing Source | Existing File/Function | Availability | Notes |
|---|---|---|---|---|
| `portfolio_aggregated_greeks` | `aggregateGreeks()` | `greek-aggregation.ts` | Available | Reimplement in Python for hedge engine |
| `concentration` | `computeConcentrationBreakdown()` | `risk.ts` | Available | Reimplement |
| `risk_status` | `computeCompositeRiskStatus()` | `risk.ts` | Available | Reimplement |

## Critical gaps summary

| Field | Status | Action Required |
|---|---|---|
| `cost_basis` (per position) | **Missing** | Compute from trade history aggregation |
| `unrealized_pnl` (per position) | **Missing** | Compute as market_value − cost_basis |
| `sector` (per position) | **Indirect** | Fetch from Market Lake fundamentals or sector-rs.ts |
| `option` (all sub-fields) | **Not materialized** | Create `portfolio_option_positions` table, populate from trade netting |
| `exercise_style` | **Missing** | Hardcode "american" for US equity options; add spec DB for non-standard |
| `historical option chains` | **Missing** | Use BSM theoretical pricing for backtesting; acknowledge as approximation |

## Data flow for snapshot creation

```
1. Read portfolio_positions from PostgreSQL → positions (equity + crypto + cash)
2. Net trades to find open option positions:
   - Read portfolio_trades WHERE is_option = true
   - Group by (symbol, option_type, option_strike, option_expiry)
   - Sum quantities (buy: +qty, sell: -qty)
   - Filter WHERE net_qty != 0
3. For each open option:
   - Parse underlying from option symbol
   - Fetch live chain from Market Lake /live/option-chain/{underlying}
   - Match by strike + expiration + type
   - Extract Greeks, bid/ask, IV
4. For each equity/crypto position with missing sector:
   - Fetch from Market Lake /fundamentals/{symbol}
5. Compute aggregated Greeks, concentration, risk status
6. Assemble snapshot with metadata and data-quality warnings
```
