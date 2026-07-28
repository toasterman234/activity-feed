# ADR-016: Start portfolio-aware Trade Lab with transparent approximations

## Status

Accepted

## Date

2026-07-27

## Context

The broker feeds expose normalized cash-equity positions, market values, sectors, and partial beta
coverage. They do not currently expose a complete portfolio option book or covariance model.

## Decision

Trade Lab will calculate before/after capital and concentration exactly from available position
values. Cash equities are treated as 1.0 delta, proposed option Greeks come from the live chain,
and the market-down stress uses beta-weighted exposure only where beta exists.

Missing beta, sector, broker, or option-position data is displayed as incomplete or unknown rather
than treated as zero. Initial working limits are 10% proposed capital, 15% single-symbol exposure,
and 30% known-sector exposure.

## Consequences

- The operator gets immediately useful portfolio context without false precision.
- The stress result is explicitly an approximation, not VaR.
- Existing option positions and correlations require richer broker/lake contracts before aggregate
  portfolio Greeks or hedge optimization can be considered complete.
- Saved paper plans retain the contemporaneous portfolio-risk snapshot for later feedback analysis.
