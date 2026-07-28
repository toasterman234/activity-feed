# ADR-019: Screener preset and recipe engine

## Status

Accepted — executed 2026-07-27.

## Context

The user wanted to apply existing quant scanning strategies (options flow,
fundamentals, momentum, dividends, VRP, etc.) through the Screener. The
requirement was for:
- Built-in presets covering common strategies
- Mode-specific filters and toggles
- Ability to save personal screens
- Custom-screen recipe creation

## Decision

Build a preset-first screener with a versioned recipe engine:

1. **Nine built-in presets**: live options, high-IV liquid chains, put flow,
   composite, VRP/options, fundamentals, momentum, dividends, technicals.
2. **Mode-specific filter UI**: each preset exposes relevant grouped filters
   and toggles that update the screen parameters.
3. **Personal saved screens**: stored on-device (localStorage), not in Postgres,
   to avoid schema churn for evolving filter definitions.
4. **Custom-screen workflow**: start from a preset, modify filters, save as a
   new named recipe. Recipes are versioned; modifications create new versions.

### Rejected alternatives
- **Postgres-backed screens**: premature; user-defined screen schemas would
  require a dynamic schema or JSONB with evolving validator code. On-device
  storage simplifies iteration.
- **Global filter set**: one-size-fits-all filters produce noisy results across
  strategies; mode-specific panels surface what's relevant.

## Consequences

### Positive
- User can toggle between 9 different screening strategies immediately.
- Presets encode domain knowledge (e.g. put flow needs volume threshold,
  fundamentals needs PE/PS/market cap).
- On-device storage works offline and survives server restarts.

### Negative / tradeoffs
- Screens are not synced across devices.
- No sharing or export of custom recipes yet.

## References

- Parent: `/finance` → Screener tab
- Component: `src/app/finance/` (Screener section)
