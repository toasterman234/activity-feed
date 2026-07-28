# Findings: Guided workflow cockpit

## Baseline assessment — 2026-07-27

- Production is `/home/ubuntu/activity-feed/dashboard` on OVH, served by Next.js
  on `127.0.0.1:3000` and exposed through Tailscale HTTPS `:8446`.
- The existing hierarchy is channel → root message/thread → optional
  `thread_meta` → plans/workflow steps/artifacts/activity events.
- Production contains 46 root threads but only 27 lifecycle metadata rows.
- The linked Research thread `d03e1ebf-da4f-440c-ae80-f6dc6c8c603f`
  (`NAC`) has no lifecycle metadata.
- The Research channel has no stored default lifecycle even though a Research
  lifecycle exists in code.
- Current lifecycle definitions enforce legal transitions and support prompt
  and command workflows, including gating command failures.
- Current state is overwritten in `thread_meta`; transition history is only
  indirectly represented by chat and operational step rows.
- Existing plan items are flat and existing artifacts are not stage-scoped.
- Existing UI captures show a long conversation dominating the page while
  workflow state, output requirements, and next decisions are compressed above it.
- Compozy's transferable principle is pipeline primacy: durable phase artifacts,
  explicit gates, task execution, review, and memory feed forward between phases.

## Existing safety constraints

- Thread extras are polled and must stay polled to avoid exhausting the HTTP/1.1
  Electric shape connection budget.
- Production is OVH; editing the Mac checkout alone is not sufficient.
- Pi must be spawned with stdin ignored through the existing safe helper.

## Inline Frame + Context Scan discovery — 2026-07-27

- OVH can reach the Mac as `bencharney@100.71.118.10` over Tailscale/SSH using
  its existing key. The Mac-local agentmemory HTTP port is not exposed on the
  tailnet, and the executor requires authentication.
- A fixed read-only Mac search script is therefore the safest initial bridge
  for Obsidian, Agent Brain, and Life OS. Queries are URL-safe base64 arguments;
  the dashboard cannot supply a shell command.
- Exact word-boundary matching is required for short terms such as `NAC`;
  substring matching produced false positives such as “inactive” and
  “unacceptable.”
- The refined NAC scan finds directly relevant personal context, including the
  health-context supplement record and a journal entry about taking NAC.
- Graph Continuity memories/decisions/observations and previous dashboard
  threads can be searched directly in OVH Postgres and merged with Mac results.
