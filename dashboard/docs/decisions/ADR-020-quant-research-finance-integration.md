# ADR-020: Quant Research → Finance channel integration

## Status

Accepted — executed 2026-07-27.

## Context

The Channels tab had 10 Quant research threads producing analysis, but the
Finance tab (watchlist, screener, Trade Lab) was a separate island. Research
findings were invisible from the finance views, and there was no way to connect
a research conclusion to a watchlist entry or screener rule.

## Decision

Build a bidirectional publication channel between Quant research threads and
the Finance tab:

1. **"Publish to Finance" panel** on research threads supporting:
   - Watchlist collections (thematic groupings: Cybersecurity, Memory & Storage,
     Mobile AI Hardware)
   - Symbol theses (attached to individual tickers)
   - Screener rules (parameterized screen definitions)
   - Trade Lab doctrine (strategy-level guidance)
2. **Versioned publications**: each publish creates a versioned artifact.
   Revisions create new versions; revocation hides without deleting history.
3. **Finance-side badges**: Watchlist and Screener symbols show matching Quant
   context badges with publication counts and last-updated timestamps.
4. **Candidate inspection enrichment**: opening a screener candidate shows linked
   Quant evidence, warnings, thesis fragments, and publication provenance.
5. **Continuity Graph integration**: publish, revise, and revoke emit `finance.*`
   graph events. Relations connect publication versions to source research
   threads, affected symbols, and preceding versions.

### Governance
- Working/review research threads can publish draft artifacts.
- Approved research threads can publish finalized artifacts.
- Revocation is confirmed (two-step) and does not delete history.

### Rejected alternatives
- **Auto-link by ticker mention**: too noisy; manual publication with context
  selection gives intentional connections.
- **Dedicated "Portfolio" channel type**: the existing Channel/Thread model is
  rich enough; a publication panel on existing threads is simpler.

## Consequences

### Positive
- Research threads are no longer siloed from investment decisions.
- Publication provenance is traceable through the Continuity Graph.
- Granular artifact types (collection, thesis, rule, doctrine) match real
  research outputs.

### Negative / tradeoffs
- Publication management adds UI complexity to the thread detail page.
- Graph events increase write volume on the OVH Postgres.

## References

- [ADR-007](ADR-007-workflow-first-threads.md) — thread workflow model
- [ADR-010](ADR-010-versioned-workflow-registry.md) — versioned registry
- [ADR-014](ADR-014-finance-publication-gate.md) — original pub gate ADR
- API: `src/app/api/finance/publications/route.ts`
