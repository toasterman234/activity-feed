# Findings: Portfolio Analytics Dashboard

## Existing architecture recon

### Data plumbing already in place
- **Electric circuits** syncs live positions (`portfolio_positions`), trades (`portfolio_trades`), balances (`portfolio_balances`), and net worth (`portfolio_net_worth`) to the UI
- **Market Lake API** (`src/lib/market-lake.ts`) proxies through Next origin (`/market-lake`) — provides:
  - Live quotes, option chains, option expirations (`getOptionChain`, `getOptionExpirations`)
  - Historical prices (`DailyBar`), fundamentals (`FundamentalSnapshot`), dividends, VRP data
  - Portfolio positions with Greeks (`PortfolioPosition`: symbol, units, price, market_value, sector, beta)
  - Option rows with full Greeks: delta, gamma, theta, vega, rho, implied_volatility, bid, ask, mid, volume, open_interest
- **Trade lab** (`src/app/finance/trade-lab-model.ts`) already computes:
  - Per-contract risk (maxProfit, maxLoss, breakeven, capitalAtRisk, netDelta, netGamma, netTheta, netVega)
  - Scenario P&L approximation using delta-gamma-theta-vega
  - Expiration P&L, payoff series
- **Portfolio risk model** (`src/app/finance/portfolio-risk-model.ts`) already computes:
  - Portfolio-level value, concentration by symbol/sector
  - Beta-weighted exposure, downside 10% stress
  - Concentration warnings
- **Finance research** (`src/lib/finance-research.ts`) has structured context model with graphContext, decisions, memory
- **Money flow** (`src/app/finance/money-flow-content.tsx`) already has risk-regime, sector rotation, COT data views with Cards, Badges, DividedList

### Page structure
- **Mobile:** `/personal` page has 5 tabs (Portfolio, Flow, Personal, Watchlist, Screener) — no bottom nav change needed
- **Desktop:** `/desktop` sidebar has Portfolio, Watchlist, Screener, Research — adding "Analytics" is one line in the NAV array
- **Bottom nav:** 4 items (Home, Channels, Projects, Ops) — stays untouched
- **Personal tab** links from `ops/page.tsx` as "Finance" entry point

### Component patterns available
- shadcn/ui components in `src/components/ui/` (Card, Badge, Skeleton, Separator, DividedList, etc.)
- Tailwind CSS v4
- TypeScript strict
- Lucide React for icons

### Gaps vs. spec
| What the spec wants | Gap |
|---|---|
| Shared MetricCard interface | Doesn't exist — need to build |
| Portfolio-level Greek aggregation | Per-contract exists, portfolio-level in `portfolio-risk-model.ts` but not exposed as cards |
| Income calculations (theta sum, premium flow, ROC) | Not implemented |
| Stress-test matrix (price × vol grid) | Only a single 10% downside in `portfolio-risk-model.ts` |
| Opportunity rule engine | Doesn't exist |
| Income concentration, stability metrics | Not implemented |
| Historical snapshots | Electric gives live data; would need snapshot table or derived from trades |
| Data freshness / methodology UI | Not implemented |
| Configurable risk weights / policy settings | Not implemented |

### Shape budget check
- Current shapes: ACTIVITY_LOG, POSITIONS, TRADES, BALANCES, TRANSACTIONS, NET_WORTH, BENCHMARKS, ALLOCATION, AGENT_RUNS, COLLECTIONS, JUDGMENTS, CHANNELS, CHANNEL_MEMBERS, MESSAGES, THREAD_PLANS, THREAD_WORKFLOW_STEPS, THREAD_ARTIFACTS, REPOS
- SHAPE_BUDGET is 4 live shapes per page
- `/personal` Portfolio tab uses 2 (POSITIONS + BALANCES), Portfolio page uses 3
- Analytics tab would need: POSITIONS (1) + TRADES (1) = 2, plus Market Lake fetches (not shapes)
- **Verdict:** Within budget — no new Electric shapes needed for Phase 1

### Data availability for Income view
- **Theta:** Available from Market Lake option chains for current positions — need to map symbol→option chain, sum signed theta × qty × 100
- **Realized P&L:** Available from `portfolio_trades` table (Electric-synced)
- **Premium cash flow:** Available from trades — need to classify by action type
- **ROC:** Requires capital/collateral data — available from balances + position data
- **Concentration:** Pure math from position values
- **Stability:** Derived from realized P&L history in trades table

## Decisions
| Decision | Rationale |
|---|---|
| Phase 1 = library + Income view only | Income has the highest signal-to-effort ratio; theta/income data is available now |
| Analytics tab on /personal, not /finance redirect | /finance already redirects to /personal; natural consolidation |
| Greek aggregation as pure functions | Deterministic, testable, no Electric dependency |
| Market Lake for options data (not new shape) | Option chains change per-second; they're fetch-on-demand not sync |
| No new DB tables for Phase 1 | Trades table already has everything needed for realized P&L |
