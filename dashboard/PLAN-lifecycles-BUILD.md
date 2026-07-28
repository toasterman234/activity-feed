# BUILD SPEC — Thread lifecycles + enable-able workflows (for pi)

**Status:** shipped — retained as historical build spec.

Self-contained implementation plan. Design rationale lives in `PLAN-lifecycles.md`;
this doc is the actionable build. Work in `/Users/bencharney/activity-feed/dashboard`.
Do the phases in order — each is independently verifiable. Commit after each phase.

Builds on already-shipped Plan/Workflow/Artifact panels. Existing relevant files:
- `src/app/schema.ts` — electric-circuits table schema (types: text/int/float/bool)
- `src/app/electric.ts` — shape defs
- `src/app/channels/shapes.ts` — data hooks. **Thread extras are POLLED, not streamed**
  (`useThreadExtras` uses `client.query({table, where})`, ADR-003). Follow that pattern.
- `src/app/channels/[channelId]/[threadId]/page.tsx` — thread page (`ThreadContent`)
- `src/app/channels/[channelId]/page.tsx` — channel page (thread list + composer)
- `src/app/api/channels/write/route.ts` — direct Postgres writes (table+row switch)
- `src/app/api/channels/trigger/route.ts` — `@agent` job runner (`runMentionJob`, `buildPrompt`)
- `src/app/writeChannelRow.ts` — client write helper (union of allowed table names)

## ⚠️ CRITICAL GOTCHAS (read first — these already bit us once)
1. **New DB tables MUST be added to the engine allowlist or reads 500 with
   `unknown table '<name>'`.** File: `/Users/bencharney/activity-feed/electric-circuits/docker/compose.activity-feed.yaml`,
   env `ELECTRIC_CIRCUITS_PG_TABLES` (comma list). After ANY schema change (new table OR
   new column on an existing table), recreate the engine:
   ```
   cd /Users/bencharney/activity-feed/electric-circuits/docker
   docker compose -f compose.yaml -f compose.activity-feed.yaml up engine -d --force-recreate
   ```
   Then confirm healthy: `docker inspect electric-circuits-engine-1 --format '{{.State.Health.Status}}'`.
   Ask Ben before recreating — it briefly interrupts live sync app-wide.
2. **DB access:** `psql` is NOT installed. Use node's `pg` client. DSN:
   `postgres://activity:activity@localhost:5433/activity_log` (container `activity-log-db`).
3. **Poll, don't stream.** Do not add new live shapes for thread/lifecycle data — it blows
   the HTTP/1.1 shape budget and froze navigation before. Extend the polled `useThreadExtras`.
4. **Mobile-first UI.** State diagram = **top-down vertical flow list**, NOT React Flow / a
   horizontal graph. No dark/mono restyle — keep the current light/zinc look.
5. **Enforcement is real:** illegal transitions return **HTTP 409**; a failed gating command
   overrides the target state. "verified" must mean checks actually passed.

## Settled decisions (baked into this spec)
- Lifecycle picked **per-thread**, pre-filled from the **channel default**; editable only
  while `state === 'drafted'`, read-only after.
- `review` may go back (running/drafting) OR accept OR reject.
- Definitions live in **code** (`lifecycles.ts`), not the DB.
- Keep BOTH the vertical state-flow panel AND the existing detailed step log.

---

## PHASE 0 — Config catalog (pure code, no DB)
Create `src/app/channels/lifecycles.ts`. Transcribe exactly:

```ts
export type StateKind = "start" | "active" | "wait" | "proven" | "done" | "dead";

export interface LifecycleState { label: string; kind: StateKind; terminal?: boolean }
export interface Workflow {
  label: string; runsAt: string;
  kind: "prompt" | "command";
  instruction?: string;   // kind:"prompt" — appended to agent task
  command?: string;       // kind:"command" — server runs it in thread cwd
  gates?: boolean;        // failed command blocks the forward transition
  defaultOn?: boolean;
}
export interface Lifecycle {
  label: string; initial: string;
  states: Record<string, LifecycleState>;
  transitions: Record<string, string[]>;   // fromState -> legal next states
  workflows: Record<string, Workflow>;
}

export const LIFECYCLES: Record<string, Lifecycle> = {
  coding: {
    label: "Coding", initial: "drafted",
    states: {
      drafted:{label:"Drafted",kind:"start"}, running:{label:"Running",kind:"active"},
      testing:{label:"Testing",kind:"active"}, blocked:{label:"Blocked",kind:"wait"},
      failed:{label:"Failed",kind:"dead"}, review:{label:"Review",kind:"wait"},
      verified:{label:"Verified",kind:"proven"},
      accepted:{label:"Accepted",kind:"done",terminal:true},
      rejected:{label:"Rejected",kind:"dead",terminal:true},
      stopped:{label:"Stopped",kind:"dead",terminal:true},
    },
    transitions: {
      drafted:["running","stopped"], running:["testing","blocked","failed","stopped"],
      testing:["review","running","failed"], blocked:["running","stopped"],
      failed:["running","stopped"], review:["verified","running","rejected"],
      verified:["accepted"], accepted:[], rejected:[], stopped:[],
    },
    workflows: {
      "reuse-scan":{label:"Reuse scan",runsAt:"running",kind:"prompt",
        instruction:"Before writing new code, search for existing code to reuse."},
      "unit-tests":{label:"Run tests",runsAt:"testing",kind:"command",
        command:"npm test",gates:true,defaultOn:true},
      "typecheck":{label:"Typecheck",runsAt:"testing",kind:"command",
        command:"npx tsc --noEmit",gates:true},
      "lint":{label:"Lint",runsAt:"testing",kind:"command",command:"npm run lint"},
      "security":{label:"Security review",runsAt:"review",kind:"prompt",
        instruction:"Audit the diff for security issues before approving."},
      "write-adr":{label:"Write ADR",runsAt:"verified",kind:"prompt",
        instruction:"Write a short decision record for what changed and why."},
    },
  },
  research: {
    label: "Research", initial: "drafted",
    states: {
      drafted:{label:"Drafted",kind:"start"}, searching:{label:"Searching",kind:"active"},
      synthesizing:{label:"Synthesizing",kind:"active"}, blocked:{label:"Blocked",kind:"wait"},
      review:{label:"Review",kind:"wait"},
      accepted:{label:"Accepted",kind:"done",terminal:true},
      rejected:{label:"Rejected",kind:"dead",terminal:true},
      stopped:{label:"Stopped",kind:"dead",terminal:true},
    },
    transitions: {
      drafted:["searching","stopped"], searching:["synthesizing","blocked","stopped"],
      synthesizing:["review","searching","stopped"], blocked:["searching","stopped"],
      review:["accepted","searching","rejected"], accepted:[], rejected:[], stopped:[],
    },
    workflows: {
      "vault-first":{label:"Vault first",runsAt:"searching",kind:"prompt",
        instruction:"Check the existing vault notes before searching the web."},
      "cross-check":{label:"Cross-check",runsAt:"synthesizing",kind:"prompt",
        instruction:"Verify each claim across at least two independent sources.",defaultOn:true},
      "cite-verify":{label:"Verify citations",runsAt:"review",kind:"prompt",
        instruction:"Confirm every cited URL resolves and supports the claim.",defaultOn:true},
      "save-to-vault":{label:"Save to vault",runsAt:"accepted",kind:"command",
        command:"obsidian-save"},
    },
  },
  planning: {
    label: "Planning", initial: "drafted",
    states: {
      drafted:{label:"Drafted",kind:"start"}, drafting:{label:"Drafting",kind:"active"},
      blocked:{label:"Blocked",kind:"wait"}, review:{label:"Review",kind:"wait"},
      accepted:{label:"Accepted",kind:"done",terminal:true},
      stopped:{label:"Stopped",kind:"dead",terminal:true},
    },
    transitions: {
      drafted:["drafting","stopped"], drafting:["review","blocked","stopped"],
      blocked:["drafting","stopped"], review:["accepted","drafting"],
      accepted:[], stopped:[],
    },
    workflows: {
      "task-breakdown":{label:"Task breakdown",runsAt:"drafting",kind:"prompt",
        instruction:"Decompose the goal into concrete, ordered tasks.",defaultOn:true},
      "estimate":{label:"Estimate",runsAt:"drafting",kind:"prompt",
        instruction:"Add a rough effort estimate per task."},
      "challenge":{label:"Red-team",runsAt:"review",kind:"prompt",
        instruction:"Argue against this plan — surface risks and failure modes."},
      "create-tasks":{label:"Create tasks",runsAt:"accepted",kind:"command",
        command:"obsidian-task"},
    },
  },
};

export const DEFAULT_LIFECYCLE = "coding";

export function canTransition(lc: string, from: string, to: string): boolean {
  return LIFECYCLES[lc]?.transitions[from]?.includes(to) ?? false;
}

export function defaultEnabledWorkflows(lc: string): string[] {
  const wf = LIFECYCLES[lc]?.workflows ?? {};
  return Object.entries(wf).filter(([, w]) => w.defaultOn).map(([id]) => id);
}

// Dev-time sanity check — throw on malformed definitions.
export function validateLifecycles(): void {
  for (const [key, lc] of Object.entries(LIFECYCLES)) {
    if (!lc.states[lc.initial]) throw new Error(`${key}: initial '${lc.initial}' missing`);
    for (const [from, tos] of Object.entries(lc.transitions)) {
      if (!lc.states[from]) throw new Error(`${key}: transition from unknown '${from}'`);
      for (const to of tos) if (!lc.states[to]) throw new Error(`${key}: '${from}'->unknown '${to}'`);
      if (lc.states[from].terminal && tos.length) throw new Error(`${key}: terminal '${from}' has out-edges`);
    }
    for (const [id, w] of Object.entries(lc.workflows))
      if (!lc.states[w.runsAt]) throw new Error(`${key}: workflow '${id}' runsAt unknown '${w.runsAt}'`);
  }
}
```
**Verify:** `npx tsc --noEmit` passes; call `validateLifecycles()` once (e.g. a temp script) — no throw.

---

## PHASE 1 — Storage
### 1a. SQL (run via node `pg`)
```sql
CREATE TABLE IF NOT EXISTS thread_meta (
  thread_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  lifecycle TEXT NOT NULL,
  state TEXT NOT NULL,
  enabled_workflows TEXT NOT NULL DEFAULT '[]',  -- JSON array string
  updated_at TEXT NOT NULL
);
ALTER TABLE channels ADD COLUMN IF NOT EXISTS default_lifecycle TEXT;
```
### 1b. `schema.ts`
- Add `thread_meta` table def (all columns `text`).
- Add `default_lifecycle: { type: "text" }` to the `channels` columns.
### 1c. `electric.ts`
- Add `export const THREAD_META_SHAPE = { table: "thread_meta" };` (used only as the
  `client.query` table name; not held as a live shape).
### 1d. Engine allowlist + restart (SEE GOTCHA #1)
- Add `thread_meta` to `ELECTRIC_CIRCUITS_PG_TABLES` in `compose.activity-feed.yaml`
  (channels already listed). Recreate engine, confirm healthy. **Ask Ben first.**
### 1e. `writeChannelRow.ts`
- Add `"thread_meta"` to the union table type.
### 1f. `write/route.ts`
- Add a `thread_meta` branch: upsert on `thread_id` (INSERT … ON CONFLICT (thread_id)
  DO UPDATE SET lifecycle, state, enabled_workflows, updated_at). Include a `channels`
  update path for `default_lifecycle` (either extend the channels branch to set it, or a
  dedicated `set_channel_default` action).

**Verify:** node script inserts a `thread_meta` row and `client`-style query reads it back
with no 500. `docker inspect ... Health.Status` = healthy.

---

## PHASE 2 — Read plumbing (`shapes.ts`)
- Add `ThreadMetaRow { thread_id; channel_id; lifecycle; state; enabled_workflows; updated_at }`.
- Extend `useThreadExtras(threadId)` to also `client.query({table:"thread_meta", where})`
  and return `meta: ThreadMetaRow | null` (parse `enabled_workflows` JSON at the edge, or
  expose raw + parse in the component). Keep the 3s poll + `refresh()`.
- Channel default: the `channels` live shape now carries `default_lifecycle` — surface it
  in `useChannelRows` (add the column to the select) so the channel/thread pages can read it.

**Verify:** thread page logs the meta row; channel rows include `default_lifecycle`.

---

## PHASE 3 — Picker UI (pinned at top of thread)
In `ThreadContent` (`[threadId]/page.tsx`), add a pinned block above the Plan panel:
- **Lifecycle `<select>`** listing `Object.keys(LIFECYCLES)` (labels from `.label`).
  Disabled unless `meta.state === 'drafted'`. On change → `writeChannelRow("thread_meta", …)`
  with the new lifecycle, `state: LIFECYCLES[new].initial`, and
  `enabled_workflows: JSON.stringify(defaultEnabledWorkflows(new))`; then `extras.refresh()`.
- **Workflow checklist**: for the current lifecycle, list its `workflows`; checkbox toggles
  membership in `enabled_workflows`. Editable regardless of state (you can change checks
  mid-run) — but keep it compact.
- **Bootstrap:** if no `thread_meta` row exists yet for this thread, create one on first
  load using the channel's `default_lifecycle` (fallback `DEFAULT_LIFECYCLE`), `state` =
  that lifecycle's `initial`, default workflows enabled.

**Verify (browser):** open a thread; picker shows; switching lifecycle while `drafted`
works and locks after; checklist persists across reload.

---

## PHASE 4 — Vertical state-flow panel (mobile-first)
New component `src/app/channels/StateFlow.tsx`:
- Props: `lifecycleKey`, `currentState`.
- Render the lifecycle's states as a **top-down vertical list** (forward path down the
  middle in `transitions` order from `initial`; branch/terminal states like blocked/failed/
  rejected shown as small side-tags off their parent). Current state highlighted (ring +
  bg). Color each by `kind`: active=blue, wait=amber, proven=teal, done=green, dead=red,
  start=zinc. Plain divs + Tailwind, no graph library.
- Place it in the thread page where useful (above the existing Workflow step log). **Keep
  the existing step log** below it.

**Verify (browser + phone via Tailscale):** the flow reads clearly in a narrow column;
current state is obvious; three lifecycles each render sensibly.

---

## PHASE 5 — Transition enforcement (409) + switch lock
In `write/route.ts` `thread_meta` branch:
- On a state change (row exists and `state` differs): load current row; if the update is a
  lifecycle switch, allow only when current `state === 'drafted'` → else `409`. For a plain
  state change, require `canTransition(lifecycle, oldState, newState)` → else respond `409`
  with `{error:"illegal transition", from, to}`. (Import from `lifecycles.ts`.)

**Verify:** node/curl test — a legal transition returns 200; an illegal one (e.g. coding
`drafted`→`review`) returns 409; switching lifecycle after leaving `drafted` returns 409.

---

## PHASE 6 — Agent runtime + workflows (`trigger/route.ts`)
Extend `runMentionJob` / the trigger flow:
1. Load the thread's `thread_meta` (lifecycle, state, enabled_workflows).
2. **Prompt workflows:** collect enabled workflows where `kind==='prompt'` &&
   `runsAt===currentState`; append their `instruction`s inside `buildPrompt()` under a
   "Active workflows:" block.
3. **Reply schema:** add optional `nextState: string` to
   `src/app/api/channels/trigger/reply-schema.json` and the parsed type — the agent proposes
   where the run should move.
4. After the agent replies, if `nextState` given:
   - validate `canTransition(lifecycle, state, nextState)`; if illegal, keep state, post a
     note, and record an `error` workflow step.
   - **Command workflows / gating:** run enabled `kind==='command'` workflows whose
     `runsAt===nextState`, via `execFile` in the thread cwd; record each as a
     `thread_workflow_steps` row (running→done/failed) and, on failure, write the output as
     a `thread_artifacts` row. If any `gates:true` command fails → override: set the target
     to the lifecycle's failure state (`failed` if present, else stay) instead of `nextState`.
   - Upsert `thread_meta.state` to the final resolved state.
5. Keep posting the chat `message` and any `plan`/`artifact` as today.

**Verify (browser):** in a **coding** thread, `@pi` a task; watch state advance
drafted→running→testing; force a failing test (temporary) and confirm it gates to `failed`
with the log captured as an artifact; then a passing run reaches review→verified→accepted.

---

## PHASE 7 — Full verification (MANDATORY, per Ben's rules)
Use the **Interceptor** skill on the real PWA (localhost:3000 AND phone via Tailscale
`http://100.71.118.10:3000`). Confirm, with screenshots + console/network check:
- picker renders, defaults from channel, locks after `drafted`;
- vertical state flow renders well on a narrow phone screen;
- a live `@pi` coding run advances states, a gating failure blocks it, an illegal transition
  is refused (409);
- both panels (flow + step log) coexist; no console errors; layout not broken.
Clean up any test rows afterward.

## Out of scope (do NOT do now)
- React Flow / graph library; dark-mode/Monaspace restyle; DB-authored lifecycles;
  UI for editing the `lifecycles.ts` catalog; per-workflow config beyond enable/disable.
