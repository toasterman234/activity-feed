# Findings: Graph Continuity

## Status
Historical survey notes from the original build-out. Kept for context; no longer the source of truth for rollout status.

## Still-true findings from the initial survey

### Write path
- All writes go through Postgres via the server routes, not the Electric client
- Graph continuity data should remain server-written and poll-read

### Polling pattern
- Live Electric shape budget is intentionally tight
- Secondary continuity data belongs on the `thread-extras` poll path, not new held shapes

### Structured reply contract
- Agent replies extend the base chat schema with checkpoint / observations / memory_candidates / decision / proposal

### Prompt construction
- Continuity works by folding admitted context into the next mention prompt
- The important folded surfaces are checkpoint, active decisions, accepted memory, and open proposal titles

### Feature flags
- `CHANNEL_GRAPH=1` enables the feature
- Empty `CHANNEL_GRAPH_CHANNELS` means the feature is enabled for all channels

### Thread UI
- Thread detail is already dense, so continuity must stay compact and secondary to the main conversation
