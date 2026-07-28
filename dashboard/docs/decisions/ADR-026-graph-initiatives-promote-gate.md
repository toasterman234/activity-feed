# ADR-026: Graph initiatives and promote gate

## Status

Accepted — 2026-07-27.

## Context

Graph Continuity borrowed ActiveGraph pack patterns (memory candidates, decisions,
capability proposals) but work still lived primarily in chat/PLAN/git. Status could
drift and open work did not have to leave a trail. ActiveGraph’s useful lesson is
not “install the Python runtime,” but: **official state changes through gated events**.

## Decision

1. Add `graph_initiatives` objects linked (optionally) to `evidence-map.json` ids and
   channel threads.
2. **Promote gate:** `status=shipped` is only set via `promoteInitiative`, which:
   - refuses when an active decision `blocks` the initiative;
   - when `evidence_map_id` is set, runs `check-plan-status` and refuses on fails.
3. **Mandatory events:**
   - lifecycle transitions emit `lifecycle.transitioned` (when `CHANNEL_GRAPH=1`);
   - successful OVH deploys emit `deploy.activated`.
4. Evidence UI seeds initiatives from the map (`?sync=1`) and exposes Promote.
5. Do **not** auto-rewrite PLAN markdown on promote — Evidence remains the proof
   layer; the graph holds admitted initiative status.

## Consequences

- Shipping is an explicit, evidenced act — not an agent narrative.
- Unregistered work can still happen, but mapped initiatives cannot be marked
  shipped without proof.
- Full ActiveGraph replay/fork remains out of scope.
