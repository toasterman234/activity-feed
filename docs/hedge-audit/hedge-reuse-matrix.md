# Portfolio Hedge Lab — Reuse Matrix

**Repository:** `Meseverri/portfolio-hedge-lab` (GitHub)  
**Nature:** Academic backtest pipeline — 110k-line monolithic Python script + supporting docs  
**Verdict:** **Minimal direct reuse.** Extract formulas and methodology, discard the monolithic structure.

---

| Component | Current Purpose | Reuse Decision | Required Change | Target Location | Reason |
|---|---|---|---|---|---|
| **`quant_pipeline.py`** | Monolithic pipeline: data download → Markowitz → EW → BSM → strategies → metrics → Excel | **Ignore** | Cannot reuse as-is. Too large, too coupled, wrong outputs. | N/A | Monolithic structure incompatible with service architecture. Extract specific functions. |
| **BSM pricing functions** (in quant_pipeline.py) | Black-Scholes-Merton pricing, Greeks, implied vol | **Extract into shared package** | Extract ~200 lines of BSM formulas into a standalone `bsm.py` module. Add tests. | `hedge-engine/src/bsm.py` | Mathematically correct implementation. Critical for Phase 3-5 when historical option chains are unavailable. |
| **Hedge ratio / beta rolling** (in quant_pipeline.py) | 36-month rolling beta of portfolio vs benchmark | **Reuse with modification** | Extract beta computation logic. Adapt to use our PostgreSQL data instead of yfinance. | `hedge-engine/src/risk/beta.py` | Correct methodology. Our portfolio holdings change — hedge-lab's static portfolio is simpler. |
| **Option strategy logic** (in quant_pipeline.py) | Protective Put, Covered Call, Collar sizing via beta | **Reuse with modification** | Extract strategy sizing formulas. Adapt to individual position hedging (not portfolio-level beta hedging). | `hedge-engine/src/strategies/` | Formulas are sound. Context is different: we hedge specific positions, not a reconstructed portfolio. |
| **Performance metrics** (in quant_pipeline.py) | CAGR, Sharpe, MaxDD, Drag, Sortino, Calmar | **Reuse unchanged** | Extract ~50 lines of metrics computation. Add tests. | `hedge-engine/src/metrics.py` | Standard financial metrics, well-implemented. |
| **Outlier detection** (`scripts/diagnostico_outliers.py`) | Classifies return outliers (A/B/C/D) | **Reuse unchanged** | Extract classification logic. Useful for data quality in Phase 5-6. | `hedge-engine/src/validation/outliers.py` | Robust classification methodology. |
| **`config.json`** | Pipeline parameterization | **Reuse with modification** | Good pattern for assumption sets. Adapt schema for hedge-specific params. | `hedge.assumption_sets` JSONB column | Configuration pattern is solid. |
| **`docs/METODOLOGIA.md`** | Methodology documentation, formulas, bibliography | **Reuse unchanged** | Reference document. No code changes. | `docs/hedge-engine-methodology.md` | Excellent academic reference. |
| **`docs/CASOS_LIMITE.md`** | 35+ edge cases and fallbacks | **Reuse with modification** | Use as inspiration for hedge engine error handling. Different system, different edge cases. | Reference only | Good pattern for documenting edge cases. |
| **`docs/rules.md`** | 12 binding project rules | **Ignore** | Project-specific rules for an academic TFG. Don't apply to our system. | N/A | Not relevant. |
| **`docs/prompt.txt`** | Original pipeline spec | **Ignore** | Historical artifact. | N/A | Not relevant. |
| **`docs/prompt_webapp.txt`** | Spec for a visualization webapp (never built) | **Ignore** | References a Next.js app that was never built. | N/A | Not relevant. Duplicate of our existing dashboard. |
| **`requirements.txt`** | Python dependencies | **Reference only** | We need different deps (FastAPI, psycopg, httpx for Market Lake). | `hedge-engine/pyproject.toml` | Reference for packages used in BSM/metrics. |
| **Markowitz optimizer** (in quant_pipeline.py) | Mean-variance optimization for portfolio construction | **Ignore** | We don't need portfolio construction. We need hedge combination optimization, which is similar but distinct. | N/A | Wrong objective function. |
| **Equiweight portfolio logic** (in quant_pipeline.py) | 1/n portfolio construction | **Ignore** | We have actual holdings, not theoretical portfolios. | N/A | Wrong purpose. |
| **yfinance data download** (in quant_pipeline.py) | Downloads 700+ ticker price histories from yfinance | **Replace** | Use Market Lake `/prices/historical/{symbol}` instead. Remove yfinance dependency. | N/A | Market Lake is our canonical market data source. |
| **FRED DGS1MO download** (in quant_pipeline.py) | Downloads risk-free rate from FRED | **Replace** | Add FRED DGS* series to Market Lake or fetch directly in hedge engine. | `hedge-engine/src/data/fred.py` | Need interest rates for Phase 5. |
| **Excel output generation** (in quant_pipeline.py) | Multi-sheet Excel with openpyxl | **Replace** | Store results in PostgreSQL `hedge.*` tables. Return JSON via API. | N/A | Excel is not an API. |
| **Parquet cache** (`data/raw/*.parquet`) | Cache for yfinance downloads | **Ignore** | Market Lake has its own caching (DuckDB). | N/A | Different caching layer. |
| **S&P 500 metadata** (`data/metadata/sp500_jan1_2010_2026_combined.csv`) | S&P 500 constituents 2010-2026 | **Ignore** | Use Market Lake symbol search + fundamentals for universe filtering. | N/A | Different universe — we hedge our actual holdings, not the S&P 500. |
| **Pipeline CLI** (`--skip-downloads`, `--skip-markowitz`, etc.) | Command-line flags for fast iteration | **Reuse with modification** | Good pattern for hedge run parameters. Adapt as REST API query params. | Hedge API POST /hedge/runs body | CLI flag pattern is ergonomic. |
| **Logging** (`logs/pipeline.log`) | Plain text log file | **Replace** | Use structured logging (Python `logging` → JSON) for observability. | `hedge-engine/src/logging.py` | Need structured, queryable logs. |

---

## Keep List (extract from hedge-lab)

| Module | Lines (est.) | Destination |
|---|---|---|
| BSM pricing + Greeks | ~200 | `hedge-engine/src/pricing/bsm.py` |
| Performance metrics (CAGR, Sharpe, MaxDD, etc.) | ~50 | `hedge-engine/src/metrics.py` |
| Outlier classification | ~100 | `hedge-engine/src/validation/outliers.py` |
| Beta rolling computation | ~80 | `hedge-engine/src/risk/beta.py` |
| Strategy sizing formulas | ~150 | `hedge-engine/src/strategies/sizing.py` |
| **Total extractable** | **~580 lines** | From 110,759 lines (0.5%) |

## Discard List

- Full `quant_pipeline.py` — 110,000+ lines replaced by modular service
- Markowitz optimizer — wrong objective
- Equiweight logic — wrong portfolio
- yfinance download — replaced by Market Lake
- Excel output — replaced by PostgreSQL + JSON API
- Next.js frontend spec — duplicate of our dashboard
- Academic project rules — not applicable
