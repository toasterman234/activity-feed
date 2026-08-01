# Task Plan: Hedge Engine Integration

## Goal
Build a headless hedge-analysis service integrated with the Activity Dashboard, without duplicating portfolio/UI/analytics. Based on the integration audit at `docs/hedge-audit/`.

## Architecture decision
- **Option E (Hybrid):** Headless Python/FastAPI service + same-process worker polling PostgreSQL job table
- **New `hedge-engine/` directory** — separate Python project, sibling to `dashboard/`
- **New `hedge` PostgreSQL schema** in existing `activity_log` database — clear ownership boundary
- **Read-only on `portfolio_*` tables**, read/write on `hedge.*` tables
- **Hedge API proxied through Next.js** — `/hedge-api → :9080` rewrite, same pattern as Market Lake
- **New "Hedges" tab** on `/personal` page + desktop sidebar entry
- **Reuse from hedge-lab repo:** BSM formulas (~200 lines), performance metrics (~50 lines), outlier detection (~100 lines), beta rolling (~80 lines), strategy sizing (~150 lines)

## Phases

### Milestone 0: Prerequisites
- [x] 0.1 Materialize option positions (`portfolio_option_positions` table)
- [x] 0.2 Create `hedge` PostgreSQL schema (12 tables)
- [x] 0.3 Stand up Hedge API service scaffolding (FastAPI, health endpoint, Next proxy)
- [x] 0.4 Extract BSM pricing module from hedge-lab
- [x] 0.5 Implement portfolio snapshot endpoint (`POST /hedge-api/snapshots`)
- **Status:** complete

### Phase 3: Hedge Candidate Scanning
- [x] 1.1 Implement candidate scanner (protective puts, covered calls, collars)
- [x] 1.2 Add "Hedges" tab to `/personal` + desktop sidebar
- **Status:** complete

### Phase 4: Combination Optimization
- [x] 2.1 Implement combination optimizer (correlation matrix, frontier)
- **Status:** complete

### Phase 5: Rolling Simulation
- [x] 3.1 Implement rolling simulator (BSM theoretical pricing, rolling windows)
- [x] 3.2 Add FRED/VIX interest rate + vol proxy
- **Status:** complete

### Phase 6: Walk-Forward Validation
- [ ] 4.1 Implement walk-forward validator (train/test split, reliability scoring)
- [ ] 4.2 Polish + hardening (logging, error handling, docs)
- **Status:** pending

## Previous work (Portfolio Analytics Dashboard) — COMPLETE
- Phase 1: Analytics library + Income view ✓
- Phase 2: Risk view ✓
- Phase 3: Opportunities view ✓
- Phase 4: Settings + polish ✓ (deployed, verified in browser)
  - Data freshness badges on Income + Risk views
  - Settings drawer (plain div, no external dialog) with 20+ sliders
  - Settings button in tab bar
  - Policy config persists to localStorage
- Phase 5: AI explanation layer — deferred

## Decisions
| Decision | Rationale |
|---|---|
| Separate Python service, not internal package | Quant ecosystem is Python; dashboard is TypeScript. Child process or WASM would be fragile. |
| PostgreSQL job queue, not Redis/Celery | Single-user scale. No existing queue infra. PG-backed jobs table + polling is sufficient. |
| Same database, separate schema | Avoids new infrastructure. `hedge.*` schema gives clear ownership without a new DB. |
| BSM theoretical pricing for Phase 5 | No historical option chains available. Accept theoretical prices as known limitation. |
| New `/personal` tab, not new page | Same pattern as Analytics tab. Zero nav restructuring. |

## Errors
| Phase | Error | Attempt | Resolution |
|---|---|---|---|
| — | — | — | — |
