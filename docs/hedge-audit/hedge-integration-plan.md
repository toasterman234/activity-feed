# Hedge Engine Integration Plan

**Post-Audit Implementation Sequence**  
**Goal:** Build a headless hedge-analysis service integrated with the Activity Dashboard, without duplicating portfolio/UI/analytics.

---

## Legend

- 🔒 **Blocker** — Must complete before subsequent phases
- 🔧 **Dependency** — Another step must finish first
- ⚠️ **Risk** — Known risk requiring careful attention

---

## Milestone 0: Prerequisites (before Phase 3)

### Step 0.1: Materialize option positions 🔒

**Objective:** Create a reliable source for option positions in PostgreSQL.

**Files/services affected:**
- `dashboard/ingestion/sync_lifeos_to_pg.py` — add new table + sync logic
- PostgreSQL — new table `portfolio_option_positions`

**Database changes:**
```sql
CREATE TABLE portfolio_option_positions (
    position_id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,          -- option contract symbol (e.g., AAPL250117P00180000)
    underlying TEXT NOT NULL,      -- extracted underlying (e.g., AAPL)
    option_type TEXT NOT NULL,     -- 'call' or 'put'
    option_strike DOUBLE PRECISION NOT NULL,
    option_expiry TEXT NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,  -- negative = short, positive = long
    multiplier INTEGER DEFAULT 100,
    institution TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**New code:**
- Trade netting function (reuse logic from `use-option-greeks.ts:computeOpenOptions`)
- Add to `sync_all()` in `sync_lifeos_to_pg.py`

**Tests required:**
- Unit test: trade netting produces correct open positions
- Unit test: opening + closing trades net to zero
- Integration test: positions sync correctly to PG

**Exit criteria:**
- `portfolio_option_positions` populated with correct open option positions
- Net quantity zero for closed positions
- Fresh sync matches the dashboard's computed option positions

**Dependencies:** None  
**Risks:** Trade history may have gaps causing incorrect netting. Validate against known positions first.

---

### Step 0.2: Create `hedge` PostgreSQL schema 🔒

**Objective:** Dedicated schema for hedge engine data.

**Files/services affected:**
- PostgreSQL — new schema + tables

**Database changes:**
```sql
CREATE SCHEMA IF NOT EXISTS hedge;

CREATE TABLE hedge.runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID REFERENCES hedge.portfolio_snapshots(id),
    assumption_set_id UUID REFERENCES hedge.assumption_sets(id),
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, running, complete, failed
    params JSONB,
    summary JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hedge.portfolio_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_data JSONB NOT NULL,
    valuation_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hedge.assumption_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    params JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hedge.candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES hedge.runs(id),
    symbol TEXT NOT NULL,
    strategy TEXT NOT NULL,  -- protective_put, covered_call, collar
    score DOUBLE PRECISION,
    legs JSONB,  -- array of contract legs
    metrics JSONB,  -- Greeks, cost, hedge ratio, etc.
    rank INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hedge.candidate_legs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES hedge.candidates(id),
    leg_type TEXT NOT NULL,  -- long_put, short_call, underlying
    symbol TEXT NOT NULL,
    option_type TEXT,
    strike DOUBLE PRECISION,
    expiration TEXT,
    quantity DOUBLE PRECISION,
    estimated_price DOUBLE PRECISION,
    delta DOUBLE PRECISION,
    gamma DOUBLE PRECISION,
    theta DOUBLE PRECISION,
    vega DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hedge.scenario_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES hedge.candidates(id),
    scenario_label TEXT NOT NULL,
    price_change_pct DOUBLE PRECISION,
    iv_change_points DOUBLE PRECISION,
    estimated_pnl DOUBLE PRECISION,
    portfolio_value DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hedge.historical_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES hedge.runs(id),
    candidate_id UUID REFERENCES hedge.candidates(id),
    date TEXT NOT NULL,
    hedge_pnl DOUBLE PRECISION,
    unhedged_pnl DOUBLE PRECISION,
    benchmark_return DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hedge.rolling_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES hedge.runs(id),
    candidate_id UUID REFERENCES hedge.candidates(id),
    window_start TEXT NOT NULL,
    window_end TEXT NOT NULL,
    metrics JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hedge.optimization_frontiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES hedge.runs(id),
    frontier_data JSONB,  -- array of (risk, return) points
    optimal_points JSONB,  -- max Sharpe, min variance, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hedge.validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES hedge.runs(id),
    candidate_id UUID REFERENCES hedge.candidates(id),
    train_period TEXT NOT NULL,
    test_period TEXT NOT NULL,
    metrics JSONB,
    reliability_score DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hedge.data_quality_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES hedge.runs(id),
    event_type TEXT NOT NULL,  -- missing_data, stale_price, estimation_warning
    detail TEXT,
    severity TEXT,  -- info, warning, error
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hedge.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES hedge.runs(id),
    job_type TEXT NOT NULL,  -- scan, optimize, simulate, validate
    status TEXT NOT NULL DEFAULT 'pending',
    params JSONB,
    result JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Exit criteria:**
- All tables exist in `hedge` schema
- Foreign keys + indexes in place
- Read-only on `public.portfolio_*`, read/write on `hedge.*`

**Dependencies:** None  
**Risks:** Low — standard schema creation.

---

### Step 0.3: Stand up Hedge API service scaffolding 🔒

**Objective:** FastAPI service with health endpoint, PostgreSQL connection, and Next.js proxy.

**Files/services affected:**
- New: `hedge-engine/` directory (separate from dashboard, sibling or subdirectory)
- New: `next.config.ts` — add `/hedge-api → http://127.0.0.1:9080` rewrite

**New files:**
```
hedge-engine/
├── pyproject.toml
├── requirements.txt
├── src/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   ├── config.py            # Environment + DB config
│   ├── db.py                # PostgreSQL connection pool
│   ├── router/
│   │   ├── __init__.py
│   │   ├── health.py        # GET /health
│   │   ├── runs.py          # POST /runs, GET /runs/{id}
│   │   └── snapshots.py     # POST /snapshots, GET /snapshots/{id}
│   └── worker/
│       └── loop.py          # Job polling loop
├── tests/
│   └── test_health.py
└── Dockerfile
```

**New Next.js config:**
```typescript
// Add to next.config.ts rewrites:
{ source: "/hedge-api/:path*", destination: "http://127.0.0.1:9080/:path*" },
```

**Tests required:**
- GET /health returns 200
- DB connection alive
- Proxy rewrite works

**Exit criteria:**
- Hedge API: `curl http://127.0.0.1:9080/health` → 200
- Dashboard proxy: `curl http://127.0.0.1:3010/hedge-api/health` → 200

**Dependencies:** 0.2 (needs hedge schema for DB connection)  
**Risks:** Low — standard FastAPI setup.

---

### Step 0.4: Extract BSM pricing module from hedge-lab 🔒

**Objective:** Standalone BSM pricing + Greeks module in Python.

**Files/services affected:**
- New: `hedge-engine/src/pricing/bsm.py`
- New: `hedge-engine/tests/test_bsm.py`

**Extracted from:** `portfolio-hedge-lab/quant_pipeline.py` — the BSM pricing section

**Must implement:**
- `bsm_price(S, K, T, r, sigma, option_type)` → option price
- `bsm_delta(S, K, T, r, sigma, option_type)` → delta
- `bsm_gamma(S, K, T, r, sigma)` → gamma
- `bsm_theta(S, K, T, r, sigma, option_type)` → theta
- `bsm_vega(S, K, T, r, sigma)` → vega
- `bsm_rho(S, K, T, r, sigma, option_type)` → rho
- `implied_volatility(market_price, S, K, T, r, option_type)` → IV

**Tests required:**
- Known price: verify BSM computes correct price for standard inputs
- Put-call parity: C − P = S − K × e^(−rT)
- Greeks sum: delta of ATM call ≈ 0.5
- IV inversion: iv_from_bsm(bsm_price(...)) ≈ input sigma
- Edge cases: deep ITM, deep OTM, zero vol, extreme vol

**Exit criteria:**
- All BSM functions produce correct values vs known test vectors
- Put-call parity holds
- IV inversion roundtrip within 0.001 tolerance
- 20+ unit tests passing

**Dependencies:** None  
**Risks:** Low — well-known formulas. Hedge-lab implementation is reference.

---

### Step 0.5: Implement portfolio snapshot endpoint 🔒

**Objective:** `POST /hedge-api/snapshots` creates an immutable portfolio snapshot.

**Files/services affected:**
- New: `hedge-engine/src/router/snapshots.py`
- New: `hedge-engine/src/portfolio/snapshot.py` — snapshot assembly logic

**Implementation:**
1. Read all `portfolio_positions` from PostgreSQL
2. Net trades to find open option positions (use same logic as `use-option-greeks.ts`)
3. For each option position, parse underlying from symbol
4. For each unique underlying, fetch option chain from Market Lake
5. Match contracts by strike + type + expiration
6. Extract Greeks, bid/ask, IV
7. Compute sector for equity positions from Market Lake fundamentals
8. Compute aggregated portfolio Greeks
9. Insert snapshot into `hedge.portfolio_snapshots`
10. Return snapshot with ID

**API contract:**
```
POST /hedge-api/snapshots
Response: { snapshot_id: "uuid", snapshot: {...} }

GET /hedge-api/snapshots/{id}
Response: { snapshot: {...} }
```

**Tests required:**
- Snapshot creation works with real data
- Option positions correctly resolved
- Greeks populated from Market Lake
- Snapshot is immutable (re-fetch same ID returns same data)

**Exit criteria:**
- Successful snapshot creation
- Data matches the contract defined in `portfolio-snapshot-contract.json`
- Works with both equity-only and mixed equity+options portfolios

**Dependencies:** 0.1 (option positions), 0.2 (hedge schema), 0.3 (API scaffolding)  
**Risks:** Market Lake unavailability during snapshot creation (off-hours). Add graceful degradation: store snapshot with live-fetched Greeks, accept stale.

---

## Milestone 1: Phase 3 — Hedge Candidate Scanning

### Step 1.1: Implement candidate scanner 🔧 (depends on 0.1–0.5)

**Objective:** Given a portfolio snapshot, generate a ranked list of hedge candidates.

**Files/services affected:**
- New: `hedge-engine/src/scanner/engine.py`
- New: `hedge-engine/src/scanner/strategies/protective_put.py`
- New: `hedge-engine/src/scanner/strategies/covered_call.py`
- New: `hedge-engine/src/scanner/strategies/collar.py`

**Logic:**
1. For each equity position with options available:
   - Compute hedge ratio (beta to SPY)
   - Generate protective put candidates at OTM strikes (95%, 90%, 85%)
   - Generate covered call candidates at OTM strikes (105%, 110%)
   - Generate collar candidates (put + call combo)
2. Score each candidate by:
   - Cost (lower is better for hedges)
   - Effectiveness (delta hedge ratio)
   - Vol regime (avoid hedging when IV is elevated for protective puts)
   - Fundamental quality of underlying
3. Filter by user constraints (max cost, min delta coverage, sector exclusions)
4. Rank by composite score

**Tests required:**
- Scanner produces candidates for a position with available options
- No candidates for non-optionable symbols
- Scoring order is deterministic
- Constraint filtering works

**Exit criteria:**
- `POST /hedge-api/runs { type: "scan", snapshot_id: "..." }` → job queued
- Job completes with candidates in `hedge.candidates`
- `GET /hedge-api/runs/{id}/candidates` → ranked candidate list

**Dependencies:** 0.1–0.5  
**Risks:** Market Lake rate limiting for large portfolios. Batch option chain requests. Add caching.

---

### Step 1.2: Add Hedges tab to frontend 🔧 (depends on 1.1)

**Objective:** New "Hedges" tab on `/personal` page, desktop sidebar entry.

**Files/services affected:**
- `src/app/finance/personal-content.tsx` — add "Hedges" to TABS
- `src/app/desktop/sidebar.tsx` — add Hedges nav item
- New: `src/app/finance/analytics-hedges.tsx` — hedge tab content
- New: `src/lib/hedge-api.ts` — typed fetch client
- New: `src/app/desktop/hedges/page.tsx` — desktop route

**UI components:**
- `HedgeDashboard` — overview (current exposure, last run summary)
- `HedgeRunForm` — trigger new scan (select assumption set, constraints)
- `HedgeOpportunityCard` — candidate card (symbol, strategy, cost, score, legs)
- `HedgeCompare` — side-by-side candidate comparison
- `HedgeRunHistory` — past runs with status

**Tests required:**
- Playwright: Hedges tab renders
- Playwright: Can trigger a scan (mock API)
- Playwright: Candidate cards display correctly

**Exit criteria:**
- "Hedges" tab visible on `/personal`
- Desktop sidebar has "Hedges" entry
- Hedge dashboard renders with current exposure summary
- Run form submits to Hedge API

**Dependencies:** 1.1  
**Risks:** Low — UI-only changes following existing patterns.

---

## Milestone 2: Phase 4 — Combination Optimization

### Step 2.1: Implement combination optimizer 🔧 (depends on 1.1)

**Objective:** Find optimal hedge combinations from candidate pool.

**Files/services affected:**
- New: `hedge-engine/src/optimizer/engine.py`
- New: `hedge-engine/src/optimizer/frontier.py`

**Logic:**
1. Take top N candidates from scanner
2. Compute pairwise correlation matrix from historical prices
3. Enumerate valid combinations (respect buying power, sector limits)
4. Optimize: minimize variance / maximize hedge ratio / minimize cost
5. Generate efficient frontier points
6. Return ranked combinations

**Tests required:**
- Combinator respects constraints
- Frontier computation is deterministic
- Edge case: single candidate (trivial frontier)

**Exit criteria:**
- `POST /hedge-api/runs { type: "optimize", scan_run_id: "..." }` → optimization results
- Efficient frontier stored in `hedge.optimization_frontiers`

**Dependencies:** 1.1 (needs scanned candidates)  
**Risks:** Combinatorial explosion for large candidate pools. Cap at 20 candidates per combo max.

---

## Milestone 3: Phase 5 — Rolling Simulation

### Step 3.1: Implement rolling simulator 🔧 (depends on 2.1)

**Objective:** Simulate hedge performance over rolling historical windows.

**Files/services affected:**
- New: `hedge-engine/src/simulator/engine.py`
- New: `hedge-engine/src/data/fred.py` — interest rate fetching

**Logic:**
1. Take top combinations from optimizer
2. For each rolling window (e.g., monthly steps over 3 years):
   - Freeze portfolio snapshot at window start
   - Compute BSM theoretical option prices (VIX as IV proxy)
   - Track hedge P&L vs unhedged portfolio
   - Record metrics
3. Aggregate across all windows

**Tests required:**
- Simulation produces results for at least one window
- P&L tracking is additive
- Window boundaries correct

**Exit criteria:**
- Rolling results stored in `hedge.rolling_results`
- API returns simulation summary with charts data

**Dependencies:** 2.1 (needs combinations), 0.4 (BSM module), FRED integration  
**Risks:** BSM pricing vs real market prices diverge significantly during high-vol periods. Document as known limitation.

---

## Milestone 4: Phase 6 — Walk-Forward Validation

### Step 4.1: Implement walk-forward validator 🔧 (depends on 3.1)

**Objective:** Out-of-sample validation with train/test split.

**Files/services affected:**
- New: `hedge-engine/src/validator/engine.py`
- New: `hedge-engine/src/validator/reliability.py`

**Logic:**
1. Split history 70/30 (train/test)
2. Optimize hedge strategy on train period
3. Apply to test period without re-optimization
4. Compare train vs test performance
5. Compute reliability score (CAGR decay, Sharpe decay, max drawdown ratio)
6. Split by volatility regime for regime-specific validation

**Tests required:**
- Train/test split respects date boundaries
- Reliability scoring is monotonic with performance decay
- Regime splits are non-overlapping

**Exit criteria:**
- Validation results stored in `hedge.validation_results`
- Reliability scores computed
- API returns validation report

**Dependencies:** 3.1 (needs simulation framework)  
**Risks:** Historical depth limits (10 years max from Market Lake). May be insufficient for statistical significance.

---

### Step 4.2: Polish and hardening

**Objective:** Error handling, observability, documentation.

- Structured logging in hedge engine
- Health endpoint with dependency status
- Run timeout handling (no job runs >30 minutes)
- Rate-limit compliance with Market Lake
- `hedge-engine/README.md`
- OpenWiki entries for hedge architecture

---

## Implementation Order Summary

```
0.1 Materialize option positions  ──┐
0.2 Create hedge schema           ──┤
0.3 Hedge API scaffolding         ──┼── Prerequisites (parallel)
0.4 BSM pricing module            ──┤
0.5 Portfolio snapshot endpoint   ──┘
    │
    ▼
1.1 Candidate scanner  ────────┬── Phase 3
1.2 Hedges frontend tab ───────┘
    │
    ▼
2.1 Combination optimizer  ──── Phase 4
    │
    ▼
3.1 Rolling simulator  ──────── Phase 5
    │
    ▼
4.1 Walk-forward validator  ─── Phase 6
4.2 Polish + hardening
```
