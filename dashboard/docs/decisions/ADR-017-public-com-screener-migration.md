# ADR-017: Public.com screener and watchlist migration

## Status

Accepted — executed 2026-07-27.

## Context

The Watchlist and Screener tabs under `/finance` were both returning HTTP 500. The
root cause was that the dashboard proxied Market Lake requests to `127.0.0.1:9077`
on the OVH VPS, but Market Lake only ran on the Mac Mini. After the production
cutover to OVH (ADR-005), the Mini's Market Lake service was unreachable, and both
tabs silently failed.

Public.com already powered live Watchlist quotes. The same API could serve the
Screener via option chains, prices, spreads, volume, and implied volatility.

## Decision

Migrate both Watchlist and Screener to use Public.com as their primary data source:

- **Watchlist**: live quotes refresh every 15 seconds via Public.com.
- **Screener**: live option chains, ATM IV, put/call volume, option volume, and
  nearest expiration from Public.com.
- Drop Market Lake entirely for live data.
- Accept the loss of historical metrics (252-day IV rank, variance-risk premium)
  until a history source is available.

### What was removed
- Proxied `/market-lake` API calls targeting `127.0.0.1:9077` on OVH.
- The persistent SSH auto-restarting tunnel from OVH back to the Mac's Market Lake.

### Rejected alternatives
- **Proxy Market Lake from OVH to the Mac**: add a reverse tunnel that would
  break every time the Mac slept — defeats the purpose of ADR-005.
- **Run Market Lake on OVH**: large Python service with data dependencies; not
  worth the migration effort for a secondary data source.

## Consequences

### Positive
- Both tabs work from the phone without the Mac being awake.
- Fewer services to maintain.
- Screener returns HTTP 200 for all 14 symbols immediately.

### Negative / tradeoffs
- No historical IV rank or variance-risk premium until replaced.
- Public.com option data arrives as numeric strings — normalization layer needed
  in the API response handler.

## References

- [ADR-005](ADR-005-production-host-ovh.md) — production OVH cutover
- Component: `src/app/api/finance/`
