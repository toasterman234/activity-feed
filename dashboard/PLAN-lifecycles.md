# PLAN — Thread lifecycles + enable-able workflows

Status: **shipped** (core lifecycle engine + GuideBar live on OVH as of 2026-07-26/27). Design agreed 2026-07-25; remaining open item is GuideBar Phase 6 browser QA (`task_plan.md`).
Builds on top of the already-shipped Plan / Workflow / Artifact panels (see
`src/app/channels/[channelId]/[threadId]/page.tsx` and the `thread_plans` /
`thread_workflow_steps` / `thread_artifacts` tables).

## Goal
Turn the current freeform "Workflow" feed into a **formal, pickable state machine**
per thread — inspired by the "Zion" lifecycle-fold design (@_overment). Every
thread runs a chosen *lifecycle* (state machine); within it you tick on *workflows*
(optional checks/steps) that fire during specific states and can gate transitions.

## Approach — two layers, clean split
- **Lifecycle** = the state-machine skeleton (drafted → running → review → accepted…).
- **Workflows** = optional, toggleable procedures bound to a state. Turn on/off per thread.
- **Catalog lives in code** (a config file — edit rarely, version-controlled, no docker
  restart since it's not a synced DB table). **Choices live in the DB** (per-thread:
  which lifecycle, which workflows enabled).

## Data model (additions only)
- New per-thread fields (on the root message, or a small `thread_meta` row):
  - `lifecycle` — e.g. `"coding"` | `"research"` | `"planning"`
  - `enabledWorkflows` — string[] of workflow ids
  - `state` — current lifecycle state (replaces today's freeform status)
- Reuse existing tables: `thread_workflow_steps` (step log), `thread_artifacts`
  (e.g. failing-test output). No new storage beyond the above fields.

## Config shape (`src/app/channels/lifecycles.ts`)
```ts
export interface LifecycleState { label: string; kind: StateKind; terminal?: boolean }
export interface Lifecycle {
  label: string; initial: string;
  states: Record<string, LifecycleState>;
  transitions: Record<string, string[]>;   // fromState -> legal next states
  workflows: Record<string, Workflow>;
}
export interface Workflow {
  label: string; runsAt: string;            // which state fires it
  kind: "prompt" | "command";
  instruction?: string;                     // prompt: appended to agent task
  command?: string;                         // command: server runs it
  gates?: boolean;                          // command failure blocks forward transition
  defaultOn?: boolean;
}
export function canTransition(lc: string, from: string, to: string): boolean {
  return LIFECYCLES[lc]?.transitions[from]?.includes(to) ?? false;  // the whole 409 engine
}
```
Three lifecycles drafted in-session (coding / research / planning) with full state
sets, transitions, and workflow catalogs — see chat transcript to transcribe.

Coding workflows: reuse-scan(prompt), unit-tests(command,gates,default), typecheck
(command,gates), lint(command), security(prompt), write-adr(prompt).
Research: vault-first(prompt), cross-check(prompt,default), cite-verify(prompt,default),
save-to-vault(command). Planning: task-breakdown(prompt,default), estimate(prompt),
challenge(prompt), create-tasks(command). Command workflows map to existing CLIs
(npm test, tsc, obsidian-save, obsidian-task).

## Runtime — how a workflow fires (in `api/channels/trigger/route.ts`)
On entering a state, `runWorkflowsForState()`:
1. filters enabled workflows where `runsAt === state`;
2. **prompt** workflows → fold `instruction` into `buildPrompt()` before the agent runs;
3. **command** workflows → server runs `command`, records a `thread_workflow_steps` row,
   writes output as an artifact on failure;
4. **gating**: a failed `gates:true` command overrides the target — e.g. coding
   `testing → review` becomes `testing → failed`. This is what makes "verified" mean
   tests actually passed, not that the LLM said so.

## UI (settled 2026-07-25 — phone/PWA-first)
- **State diagram = top-down vertical flow list**, NOT React Flow. Phone-first: a 10-node
  horizontal graph is unreadable / pan-zoom-fighting on a narrow screen and heavier to load.
  Render states stacked top→bottom (matches Ben's global top-down flow rule): forward path
  straight down, branch states (blocked/failed/rejected) hang off to the side. Current state
  highlighted. Colored by state `kind` (active=blue, wait=amber, done=green, dead=red,
  proven=teal) — one color map serves all lifecycles. Plain styled divs, no graph dep.
  (React Flow stays a possible *desktop-only* enhancement later — not now.)
- **No restyle**: keep the current light/zinc look consistent with Activity/Finance/Models
  tabs. No dark/mono/violet spec-sheet redesign — just add the flow panel. Drop Monaspace/
  React Flow from the dependency list.
- **Picker**: lifecycle dropdown + workflow checklist, **pinned at the top of the thread**.
  Editable only while state is `drafted` (per behavior decisions), read-only after.
- **Keep both panels**: the vertical state flow up top (where is this run) + the existing
  detailed `thread_workflow_steps` log below it (what fired, history).

## Tasks (rough order)
1. `lifecycles.ts` config + dev-time validator (states referenced exist, initial exists,
   terminals have no out-edges).
2. Add `lifecycle` / `enabledWorkflows` / `state` thread fields + write-route plumbing.
3. `canTransition` 409 check in the write route for `thread_workflow_steps` state changes.
4. `runWorkflowsForState()` in trigger route + prompt-folding + command runner + gating.
5. Picker UI (dropdown + workflow checklist).
6. `WorkflowGraph.tsx` via `@xyflow/react`; replace flat feed.
7. Font/CSS spec-sheet pass.

## Decisions (settled 2026-07-25)
- **Lifecycle pick**: per-thread picker, **defaulted from the channel**. A channel carries
  a default lifecycle (e.g. #research → Research); new threads pre-fill it, but each thread's
  dropdown can override. → needs a `default_lifecycle` field on `channels` too.
- **Switch mid-run**: allowed **only while state is `drafted`**; locked once the run starts.
  Keeps the ledger honest (no orphaned states from a different lifecycle).
- **Review bounce-back**: **yes** — `review` can send back to running/drafting, OR accept,
  OR reject. Keep the review→running / review→drafting edges in the draft config.
- **Definitions storage**: **code config file** (`lifecycles.ts`). No DB-authored lifecycles
  for now; revisit only if UI-editing is ever wanted.

## Reference / inspiration
- Pattern source: "Zion" lifecycle-fold design, @_overment (x.com/_overment).
- Governance analogs: Temporal (append-only ledger), ai-memory-mcp (409-on-illegal-transition),
  AgentGate (draft→review→approve gating). No single repo matches — custom synthesis.
- UI libs: `@xyflow/react` (node graph, the one real dep to add), shadcn/ui + Tailwind
  (table/card scaffold), Monaspace (font). Screenshot Temporal UI for graph+table layout grammar.
