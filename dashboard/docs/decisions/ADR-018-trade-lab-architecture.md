# ADR-018: Trade Lab architecture — options modeling and paper trading

## Status

Accepted — executed 2026-07-27.

## Context

After inspecting a screener candidate, the user needed a way to model trades
(covered calls, cash-secured puts, stock positions) before deciding to act. The
goal was an interactive lab that:
- Fetches live Public.com option chains for the target symbol
- Selects contracts near 0.30 delta at roughly 35 DTE
- Computes payoff, breakeven, max gain/loss, collateral requirements
- Shows Greeks and price/IV/time scenarios
- Compares multiple contracts side by side
- Saves paper-trade plans (no broker submission)

## Decision

Build Trade Lab as an in-page workflow component within the Finance tab:

1. **Contract fetch**: `Public.com` options API filtered to near 0.30 delta,
   roughly 35 DTE expiration.
2. **Fill selection**: bid, midpoint, or custom-limit pricing.
3. **Payoff calculation**: linear interpolation across strikes at expiration.
4. **Scenario grid**: ±5% / ±10% price moves, ±20% / ±50% IV moves.
5. **Portfolio integration**: see [ADR-016](ADR-016-portfolio-risk-approximation.md).
6. **Persistence**: saved paper-trade plans, no broker submission.

### Rejected alternatives
- **Full Black-Scholes engine**: overkill for paper trading; linear payoff is
  sufficient for decision-making.
- **Broker integration (Schwab/Fidelity API)**: out of scope for v1; saved
  paper-trade plans are the output.

## Consequences

### Positive
- One-click entry from any screener candidate.
- Live contract data vs. stale snapshots.
- Portfolio context in every trade decision (concentration, sector exposure).

### Negative / tradeoffs
- No real-time Greeks (uses Public.com snapshot data).
- No multi-leg strategies (iron condors, spreads) in v1.
- Paper-trade plans are local-only; no cross-session persistence yet.

## References

- [ADR-016](ADR-016-portfolio-risk-approximation.md) — portfolio risk
- Component: `src/app/finance/` (Trade Lab section)
