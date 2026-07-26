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
  issue: {
    label: "Issue", initial: "open",
    states: {
      open:        { label: "Open",        kind: "start" },
      triaged:     { label: "Triaged",     kind: "active" },
      in_progress: { label: "In progress", kind: "active" },
      blocked:     { label: "Blocked",     kind: "wait" },
      resolved:    { label: "Resolved",    kind: "proven" },
      closed:      { label: "Closed",      kind: "done", terminal: true },
      wont_fix:    { label: "Won't fix",   kind: "dead", terminal: true },
    },
    transitions: {
      open:        ["triaged", "wont_fix"],
      triaged:     ["in_progress", "blocked", "wont_fix"],
      in_progress: ["resolved", "blocked", "wont_fix"],
      blocked:     ["in_progress", "wont_fix"],
      resolved:    ["closed", "in_progress"],
      closed:      [],
      wont_fix:    [],
    },
    workflows: {
      "categorize": { label: "Categorize", runsAt: "open", kind: "prompt",
        instruction: "Classify this issue (bug/task/feature), set a priority, and confirm which repo it targets.",
        defaultOn: true },
      "scope-repo": { label: "Scope in repo", runsAt: "triaged", kind: "prompt",
        instruction: "Explore the target repo and identify the files/areas this issue affects. Write a thread plan of concrete steps." },
      "fix":        { label: "Implement fix", runsAt: "in_progress", kind: "prompt",
        instruction: "Implement the fix in the target repo. Keep changes minimal and follow the repo's conventions." },
      "verify-fix": { label: "Verify fix", runsAt: "resolved", kind: "command",
        command: "npm test", gates: true },
    },
  },
};

export const DEFAULT_LIFECYCLE = "coding";

export function canTransition(lc: string, from: string, to: string): boolean {
  return LIFECYCLES[lc]?.transitions[from]?.includes(to) ?? false;
}

/** Resolve a thread's state to its StateKind for list rollups. */
export function stateKind(lifecycle: string, state: string): StateKind | null {
  return LIFECYCLES[lifecycle]?.states[state]?.kind ?? null;
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

// ── State ordering helpers ────────────────────────────────────────────────

/** DFS walk of the state graph — main path first, then branch (dead/wait) states.
 *  Used by StateFlow diagram to lay out states top-to-bottom. */
export function walkOrder(lc: Lifecycle): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  function visit(state: string) {
    if (visited.has(state)) return;
    visited.add(state);
    order.push(state);
    const tos = lc.transitions[state] || [];
    for (const to of tos) {
      const s = lc.states[to];
      if (s && !s.terminal && s.kind !== "dead" && s.kind !== "wait") visit(to);
    }
    for (const to of tos) { if (!visited.has(to)) visit(to); }
  }
  visit(lc.initial);
  return order;
}

/** Main-path-only order — follows the first non-dead edge from each state.
 *  Used for "Step N of M" numbering in the GuideBar. */
export function mainPathOrder(lc: Lifecycle): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  function walk(state: string): boolean {
    if (visited.has(state)) return false;
    const s = lc.states[state];
    if (!s) return true;
    visited.add(state);
    path.push(state);
    if (s.terminal) return true;
    const tos = lc.transitions[state] || [];
    for (const to of tos) {
      const t = lc.states[to];
      if (t && t.kind !== "dead" && !visited.has(to)) {
        if (walk(to)) return true;
      }
    }
    return true;
  }
  walk(lc.initial);
  return path;
}

// ── GuideBar helper ───────────────────────────────────────────────────────

export interface NextStepSummary {
  stepIndex: number;      // -1 when state is off the main path (branch)
  stepCount: number;      // number of states on the main path
  stateLabel: string;
  stateKind: StateKind;
  nextHint: string | null; // null when terminal (no next step)
  legalNextStates: string[];
  isTerminal: boolean;
  onMainPath: boolean;
}

/** Derive a human-readable summary of where a thread is and what comes next.
 *  Pure function — no DB, no I/O. */
export function nextStepSummary(
  lifecycleKey: string,
  currentState: string,
  enabledWorkflows: string[],
): NextStepSummary | null {
  const lc = LIFECYCLES[lifecycleKey];
  if (!lc) return null;
  const state = lc.states[currentState];
  if (!state) return null;

  const mainPath = mainPathOrder(lc);
  const stepIndex = mainPath.indexOf(currentState);
  const legalNextStates = lc.transitions[currentState] || [];
  const isTerminal = state.terminal === true;

  let nextHint: string | null = null;
  if (!isTerminal && legalNextStates.length > 0) {
    const mainNext =
      legalNextStates.find((to) => {
        const s = lc.states[to];
        return s && s.kind !== "dead";
      }) || legalNextStates[0];
    const nextLabel = lc.states[mainNext]?.label || mainNext;

    const wfHints: string[] = [];
    for (const [wfId, wf] of Object.entries(lc.workflows)) {
      if (
        wf.kind === "prompt" &&
        wf.runsAt === mainNext &&
        wf.instruction &&
        enabledWorkflows.includes(wfId)
      ) {
        wfHints.push(wf.instruction.toLowerCase().replace(/\.$/, ""));
      }
    }

    nextHint =
      wfHints.length > 0
        ? `Next: ${wfHints.join(", ")}, then move to ${nextLabel}`
        : `Next: move to ${nextLabel}`;
  }

  return {
    stepIndex,
    stepCount: mainPath.length,
    stateLabel: state.label,
    stateKind: state.kind,
    nextHint,
    legalNextStates,
    isTerminal,
    onMainPath: stepIndex >= 0,
  };
}
