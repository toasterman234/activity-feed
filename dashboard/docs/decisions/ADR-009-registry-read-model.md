# ADR-009: Keep the agent registry a read-only projection

## Status
Accepted

## Date
2026-07-27

## Context

The dashboard needs one place to discover agent configurations, skills, MCP
tools and toolsets, models, workflows, lifecycles, runtimes, and governing
policies. Those definitions already have authoritative homes on the Mac and in
their owning repositories. Making the OVH dashboard another editable registry
would introduce conflicting configuration and unclear precedence.

The production app runs on OVH, while several authoritative sources exist only
on the Mac. The existing five-item mobile navigation is already full.

## Decision

- Registry is a normalized, read-only projection.
- A deploy-time exporter reads authoritative Mac sources and writes
  `data/registry.snapshot.json`.
- Every record uses a common envelope for identity, status, provenance,
  capabilities, and typed relations.
- Declared configuration and observed runtime status stay separate.
- Registry lives as a sub-view of Fleet, not as a sixth bottom navigation item.
- The default interaction resolves a capability query; typed catalog browsing
  remains available underneath it.
- Impact is presented as a preview with confidence, not as permission to edit.
- Secrets are never exported; only non-sensitive identifiers and source
  locations may appear.

## Alternatives Considered

### Editable registry database on OVH

This would support convenient in-app editing, but it creates a competing
configuration plane and requires bidirectional reconciliation. Rejected.

### Catalog-only table

This is simpler, but it optimizes for inventory rather than the operator's
primary question: what can handle a task right now? Kept as the secondary
Browse view.

### Add Registry to bottom navigation

The app already has five mobile tabs. A sixth would reduce tap targets and
fragment system operations. Rejected in favor of Fleet → Registry.

## Consequences

- Deployments refresh the normalized snapshot before syncing to OVH.
- Source adapters can be added independently without changing the UI contract.
- Missing relationships remain visible as incomplete coverage rather than being
  inferred as fact.
- Direct editing may be added later only through source-aware proposals with
  validation and explicit write authority.

