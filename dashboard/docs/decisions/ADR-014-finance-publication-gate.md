# ADR-014: Publish research to Finance through versioned thread artifacts

## Status

Accepted

## Date

2026-07-27

## Context

Finance needs durable screen rules, Watchlist collections, symbol theses, and Trade Lab doctrine
from Quant and selected Research threads. Arbitrary channel prose is not a safe signal source, and
the existing source-object snapshot is read-only.

## Decision

An explicit publisher creates a `finance_publication` thread artifact containing a typed JSON
envelope. Each publish or revoke operation appends a version; history is never overwritten.
Finance reads only the latest version of each publication key and excludes revoked versions.

Every publication version also emits a Continuity Graph event. Relations connect the versioned
artifact to its source thread, affected symbol identities, and the prior version when applicable.
Finance-originated research requests similarly create a graph source, event, and symbol relation
at thread creation time.

Watchlist collections and symbol theses may be published as clearly labeled working or provisional
research. Screen rules and Trade Lab doctrine require an accepted research thread.

## Consequences

- Publication is deliberate, provenance-linked, reversible, and auditable.
- Research-channel work cannot enter Finance merely because it resides in a particular channel.
- Revocation immediately removes an item from the active Finance projection while preserving its
  prior versions in the thread artifact history.
- The first implementation uses the existing artifact table, avoiding a new database migration.
- The graph is the audit/lineage layer, not the serving contract: Finance continues to consume
  typed artifacts and may display admitted graph context, but graph records never change scores.
