# Hedge Data Gap Analysis

Classifies every Phase 3–6 requirement against the current system's capabilities.

## Legend

- ✅ **Already available** — Works today, no changes needed
- 🔧 **Available with modification** — Data exists but needs adaptation
- 🔌 **Requires adapter** — Data exists in a different format/location, needs translation layer
- 📡 **Requires new data source** — Data not currently available, must be acquired
- 💾 **Requires new storage** — Data needs new tables/schemas
- 🚫 **Blocked** — Cannot proceed without resolving a dependency

---

## Phase 3: Hedge Candidate Scanning

| Requirement | Status | Details |
|---|---|---|
| Read current portfolio holdings | ✅ | `portfolio_positions` table |
| Identify optionable symbols | 🔧 | Market Lake `/fundamentals/{symbol}` doesn't expose option-ability. Need to check if chain exists via `/live/option-expirations/{symbol}` |
| Fetch live option chains | ✅ | Market Lake `/live/option-chain/{symbol}` |
| Compute hedge ratios (beta vs SPY) | 🔧 | Have `portfolio_benches` for SPY + historical prices. Need 36-month window. Missing: portfolio-level returns time series (could derive from net worth history) |
| Generate protective put candidates | 🔧 | Need volatility surface + BSM pricing. BSM module extractable from hedge-lab |
| Generate covered call candidates | 🔧 | Same as above |
| Generate collar candidates | 🔧 | Combination — needs both put and call pricing |
| Filter by fundamental quality | ✅ | Market Lake `/fundamentals/{symbol}` → piotroski_score, altman_z_score, is_financially_healthy |
| Filter by VRP regime | ✅ | Market Lake `/symbol/{symbol}/vrp/latest` → ivr_252d, vrp_30d |
| Filter by sector constraints | 🔧 | Need to add sector to portfolio snapshot (fetch from fundamentals at snapshot time) |
| Filter by concentration limits | ✅ | Already computed in analytics library |
| Score hedge candidates | 🚫 | **New logic — no existing scoring. Define scoring model.** |

---

## Phase 4: Multi-Instrument Hedge Combination Optimization

| Requirement | Status | Details |
|---|---|---|
| Compute correlation matrix | 🚫 | **No correlation data available.** Need pairwise correlations from Market Lake historical prices. Computable with ~1 year of daily bars per symbol. |
| Run convex optimization (min variance) | 🚫 | **New code.** Use scipy.optimize (same tech as hedge-lab's Markowitz). |
| Evaluate multiple hedge combos | 🚫 | **New code.** Combo enumeration + scoring. |
| Compute combined Greek exposure | 🔧 | Greek aggregation exists in TS. Reimplement in Python for hedge engine. |
| Factor in transaction costs | 🚫 | **No cost model exists.** Hedge-lab uses 0 bps. Need bid/ask spreads from Market Lake. |
| Compute efficient frontier | 🚫 | **New code.** Mean-variance or CVaR optimization frontier. |
| Account for margin/buying power | 🔧 | Existing buying power logic in `risk.ts`. Needs real margin rules from broker. |

---

## Phase 5: Rolling and Multi-Period Hedge Simulation

| Requirement | Status | Details |
|---|---|---|
| Historical price data (equity) | ✅ | Market Lake `/prices/historical/{symbol}` — ~10 years daily bars |
| Historical benchmark data | ✅ | SPY via `/prices/historical/SPY`, plus `portfolio_benches` table |
| Historical VIX data | 🔧 | Unverified — Market Lake may have `^VIX` in historical prices |
| **Historical option chains** | 📡 | **CRITICAL GAP.** Market Lake is live-only. Hedge-lab uses BSM theoretical pricing with VIX as vol proxy. Accept as limitation for Phase 5. |
| Historical interest rates | 📡 | Not in Market Lake. Hedge-lab uses FRED DGS1MO. **Need to add FRED series to Market Lake or fetch directly.** |
| Historical dividends | 📡 | Market Lake `/dividends/profile/{symbol}` gives yield only, not payment schedule. **Need ex-div dates and amounts for accurate backtest.** |
| Corporate actions | 📡 | Not available. **Accept as limitation.** May cause significant errors for symbols that split/spin-off. |
| Rolling window implementation | 🚫 | **New code.** Python with pandas rolling windows. |
| Walk-forward simulation framework | 🚫 | **New code.** Train/test split, recalibration schedule. |
| Scenario analysis (multi-period) | 🔧 | Existing scenario engine is single-period. Extend to multi-period with compounding. |

---

## Phase 6: Walk-Forward and Out-of-Sample Validation

| Requirement | Status | Details |
|---|---|---|
| Train/test split by date | 🚫 | **New code.** Configurable split points. |
| Out-of-sample performance metrics | 🚫 | **New code.** Sharpe, Sortino, max drawdown, CAGR, Calmar. Hedge-lab computes these already — formulas reusable. |
| Statistical significance testing | 🚫 | **New code.** T-test, bootstrap, or Bayesian methods. |
| Regime-based validation | 🔧 | VRP regime data available. Need to split validation by vol regime. |
| Hedge reliability scoring | 🚫 | **New code.** Composite score from multiple validation dimensions. |

---

## Cross-cutting

| Requirement | Status | Details |
|---|---|---|
| Assumption registry | 🚫 | **New.** Store in `hedge.assumption_sets` JSONB column. |
| Data quality tracking | 🚫 | **New.** `hedge.data_quality_events` table. |
| Run provenance | 🚫 | **New.** `hedge.runs` table with timestamps, params, status. |
| Result persistence | 💾 | **New.** `hedge.*` schema in existing PostgreSQL. |
| API to consume results | 🚫 | **New.** Hedge API service (Python/FastAPI). |
| Frontend integration | 🚫 | **New.** Hedges tab on /personal page, hedge-api.ts client. |

---

## Summary by Phase

| Phase | ✅ Available | 🔧 Modified | 🚫 New | 📡 New Source | 💾 New Storage | 🚫 Blocked |
|---|---|---|---|---|---|---|
| Phase 3 (Scan) | 4 | 7 | 1 | 0 | 0 | 0 |
| Phase 4 (Optimize) | 0 | 2 | 5 | 0 | 0 | 0 |
| Phase 5 (Simulate) | 2 | 2 | 2 | 2 | 0 | 0 |
| Phase 6 (Validate) | 0 | 1 | 5 | 0 | 0 | 0 |
| Cross-cutting | 0 | 0 | 6 | 0 | 1 | 0 |

**Critical blockers (must resolve before Phase 3):**
1. Materialize option positions (PREREQUISITE)
2. Stand up Hedge API service scaffolding
3. Create `hedge` PostgreSQL schema
4. Extract BSM pricing module from hedge-lab
5. Implement portfolio snapshot endpoint

**Critical blockers (must resolve before Phase 5):**
1. Historical option-chain data gap — accept BSM theoretical pricing as limitation
2. Historical interest rates — add FRED DGS1MO to Market Lake or fetch directly
3. Historical dividend payment data — add to Market Lake or accept simplification

**Non-blockers (can proceed without):**
- Corporate actions data (accept as limitation)
- Exercise style data (hardcode "american")
- Cost basis per position (compute on demand)
