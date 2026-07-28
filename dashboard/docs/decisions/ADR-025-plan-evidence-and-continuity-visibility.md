# ADR-025: PLAN evidence checks and continuity visibility

## Status

Accepted — 2026-07-27.

## Context

Graph Continuity (`CHANNEL_GRAPH`) admits channel belief (checkpoints, decisions,
memory, proposals) but most app surfaces do not write to the graph. PLAN files
were drifting from reality. We needed an honest, enforceable status layer without
pretending the graph automatically documents the whole product.

## Decision

1. Keep **Graph Inbox + thread Continuity strip** as the human gate / narrative UI.
2. Add a machine **evidence map** (`docs/evidence-map.json`) and checker
   (`scripts/check-plan-status.mjs`) that validates shipped claims against paths
   and content markers.
3. Fail production builds on hard evidence mismatches (`npm run check:plans`).
4. Expose results at `GET /api/ops/evidence`, **Settings → Evidence**, and a Home
   **Continuity** card. Do **not** add a bottom-nav tab.
5. Deployments write `data/last-deploy.json` as hard release evidence. Graph
   observations from deploy remain optional follow-up (DB write from CI/host).

## Consequences

- Status honesty for tracked initiatives is CI-enforced.
- Graph remains channel-scoped; evidence map covers PLAN/contract scope.
- UI reuses existing inbox for actions; Evidence is read-only insight into claims vs proof.
