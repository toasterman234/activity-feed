# Task Plan: Graph Continuity

## Status
Completed on OVH on 2026-07-27. This file is now a completion record, not an active todo list.

## Goal
Give @pi / @claude channel agents a shared, compounding world so context, decisions, memory, and grounded self-improvement survive across turns.

## Delivered

### Phase 1 — Core ontology + fold
- [x] Graph tables + migrations
- [x] Reply schema extension
- [x] Writers from mention flow + human source capture
- [x] Auto-admit policy for high-confidence fact/preference memory
- [x] Prompt fold for checkpoint + active decisions + accepted memory + open proposal titles
- [x] Thread timeline and compact continuity row
- [x] Initial proof on `#meta`

### Phase 2 — Decision lane
- [x] Agent `decision` writes pending inbox rows
- [x] Human `Decide:` intake and thread-level Decide action
- [x] Inbox approve/reject
- [x] Active-decision fold
- [x] Refuse / supersede behavior and supersede resolution

### Phase 3 — Proposal lane
- [x] Capability allowlist in `capabilities.ts`
- [x] Proposal validation on insert
- [x] Duplicate damping
- [x] Inbox proposal review with capability / change / evidence detail
- [x] Deterministic apply for v1 capabilities

### Memory review
- [x] Pending memory candidates visible in inbox
- [x] Accept/reject memory candidates

## Live proofs completed
- [x] Second mention cited checkpoint/memory without being asked
- [x] Agent asked to violate an active decision refused
- [x] Explicit supersede decision replaced the prior active decision
- [x] Proposal applied a fold-rule change and the next run used the new rule
- [x] Global rollout smoke-tested outside `#meta`

## Current scope
- OVH production
- Graph continuity enabled for all channels
- `#meta` remains the safest proving ground for future graph-behavior experiments
