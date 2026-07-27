export type StateKind = "start" | "active" | "wait" | "proven" | "done" | "dead";

export interface StageRequirement {
  id: string;
  label: string;
  source: "task" | "artifact" | "gate" | "approval";
  optional?: boolean;
}
export type StageModuleType =
  | "guided-interview"
  | "guided-review"
  | "context-scan"
  | "agent-run"
  | "source-collection"
  | "task-list"
  | "artifact-editor"
  | "approval"
  | "verification"
  | "publish";

export interface StageModule {
  id: string;
  type: StageModuleType;
  label: string;
  order?: number;
  config?: Record<string, unknown>;
}

export type StageGateType =
  | "interaction-approved"
  | "context-reviewed"
  | "artifact-exists"
  | "tasks-complete"
  | "approval-recorded";

export interface StageGate {
  id: string;
  type: StageGateType;
  label: string;
  message: string;
  toStates?: string[];
  config?: Record<string, unknown>;
}

export interface LifecycleState {
  label: string;
  kind: StateKind;
  terminal?: boolean;
  purpose?: string;
  requirements?: StageRequirement[];
  outputs?: string[];
  approval?: "none" | "optional" | "required";
  modules?: StageModule[];
  exitGates?: StageGate[];
}
export interface Workflow {
  label: string; runsAt: string;
  kind: "prompt" | "command";
  instruction?: string;   // kind:"prompt" — appended to agent task
  command?: string;       // kind:"command" — server runs it in thread cwd
  gates?: boolean;        // failed command blocks the forward transition
  defaultOn?: boolean;
}
export interface Lifecycle {
  label: string;
  version: number;
  description: string;
  initial: string;
  states: Record<string, LifecycleState>;
  transitions: Record<string, string[]>;   // fromState -> legal next states
  workflows: Record<string, Workflow>;
}

export const LIFECYCLES: Record<string, Lifecycle> = {
  "coding": {
    "label": "Coding",
    "version": 3,
    "description": "Define, implement, verify, review, and ship a code change.",
    "initial": "drafted",
    "states": {
      "drafted": {
        "label": "Define",
        "kind": "start",
        "purpose": "Clarify the outcome, target repository, and acceptance criteria.",
        "outputs": [
          "Scoped brief"
        ]
      },
      "running": {
        "label": "Implement",
        "kind": "active",
        "purpose": "Complete the planned change in the target repository.",
        "requirements": [
          {
            "id": "implementation-plan",
            "label": "Implementation plan",
            "source": "task"
          }
        ],
        "outputs": [
          "Working change"
        ]
      },
      "testing": {
        "label": "Verify",
        "kind": "active",
        "purpose": "Prove the change works with automated checks.",
        "requirements": [
          {
            "id": "unit-tests",
            "label": "Required checks pass",
            "source": "gate"
          }
        ],
        "outputs": [
          "Verification results"
        ]
      },
      "blocked": {
        "label": "Blocked",
        "kind": "wait",
        "purpose": "Capture the blocker, owner, and concrete unblocking action."
      },
      "failed": {
        "label": "Failed",
        "kind": "dead"
      },
      "review": {
        "label": "Review",
        "kind": "wait"
      },
      "verified": {
        "label": "Ready to ship",
        "kind": "proven",
        "purpose": "Confirm the verified change is ready to accept.",
        "requirements": [
          {
            "id": "ship-review",
            "label": "Ship review completed",
            "source": "artifact"
          },
          {
            "id": "review",
            "label": "Review approved",
            "source": "approval"
          }
        ],
        "approval": "required",
        "outputs": [
          "Ship review"
        ],
        "modules": [
          {
            "id": "ship-review",
            "type": "guided-review",
            "label": "Review before shipping",
            "config": {
              "endpoint": "/api/channels/stage-review",
              "reviewKind": "code",
              "subject": "change",
              "artifactTitle": "Ship review",
              "approveTo": "accepted",
              "reviseTo": "running"
            }
          }
        ],
        "exitGates": [
          {
            "id": "ship-review",
            "type": "artifact-exists",
            "label": "Ship review completed",
            "message": "Review the change before shipping.",
            "toStates": [
              "accepted"
            ],
            "config": {
              "title": "Ship review"
            }
          },
          {
            "id": "ship-approved",
            "type": "approval-recorded",
            "label": "Review approved",
            "message": "Approve the ship review before continuing.",
            "toStates": [
              "accepted"
            ],
            "config": {
              "kind": "stage.approval"
            }
          }
        ]
      },
      "accepted": {
        "label": "Shipped",
        "kind": "done",
        "terminal": true,
        "purpose": "The change is accepted and its durable context is recorded.",
        "outputs": [
          "Handoff or memory checkpoint"
        ]
      },
      "rejected": {
        "label": "Rejected",
        "kind": "dead",
        "terminal": true
      },
      "stopped": {
        "label": "Stopped",
        "kind": "dead",
        "terminal": true
      }
    },
    "transitions": {
      "drafted": [
        "running",
        "stopped"
      ],
      "running": [
        "testing",
        "blocked",
        "failed",
        "stopped"
      ],
      "testing": [
        "review",
        "running",
        "failed"
      ],
      "blocked": [
        "running",
        "stopped"
      ],
      "failed": [
        "running",
        "stopped"
      ],
      "review": [
        "verified",
        "running",
        "rejected"
      ],
      "verified": [
        "accepted"
      ],
      "accepted": [],
      "rejected": [],
      "stopped": []
    },
    "workflows": {
      "reuse-scan": {
        "label": "Reuse scan",
        "runsAt": "running",
        "kind": "prompt",
        "instruction": "Before writing new code, search for existing code to reuse."
      },
      "unit-tests": {
        "label": "Run tests",
        "runsAt": "testing",
        "kind": "command",
        "command": "npm test",
        "gates": true,
        "defaultOn": true
      },
      "typecheck": {
        "label": "Typecheck",
        "runsAt": "testing",
        "kind": "command",
        "command": "npx tsc --noEmit",
        "gates": true
      },
      "lint": {
        "label": "Lint",
        "runsAt": "testing",
        "kind": "command",
        "command": "npm run lint"
      },
      "security": {
        "label": "Security review",
        "runsAt": "review",
        "kind": "prompt",
        "instruction": "Audit the diff for security issues before approving."
      },
      "write-adr": {
        "label": "Write ADR",
        "runsAt": "verified",
        "kind": "prompt",
        "instruction": "Write a short decision record for what changed and why."
      }
    }
  },
  "issue": {
    "label": "Issue",
    "version": 3,
    "description": "Capture, triage, diagnose, resolve, verify, and close an issue.",
    "initial": "open",
    "states": {
      "open": {
        "label": "Capture",
        "kind": "start",
        "purpose": "Describe the problem, impact, and expected behavior.",
        "outputs": [
          "Issue brief"
        ]
      },
      "triaged": {
        "label": "Triage",
        "kind": "active",
        "purpose": "Assign priority, owner, repository, and likely affected area.",
        "requirements": [
          {
            "id": "issue-owner",
            "label": "Owner and target are known",
            "source": "task"
          }
        ],
        "outputs": [
          "Triage record"
        ]
      },
      "in_progress": {
        "label": "Resolve",
        "kind": "active",
        "purpose": "Diagnose the cause and implement the smallest complete fix.",
        "outputs": [
          "Resolution"
        ]
      },
      "blocked": {
        "label": "Blocked",
        "kind": "wait",
        "purpose": "Record the blocker and unblocking action."
      },
      "resolved": {
        "label": "Verify",
        "kind": "proven",
        "purpose": "Prove the reported behavior is corrected.",
        "requirements": [
          {
            "id": "verified-fix",
            "label": "Fix review completed",
            "source": "artifact"
          },
          {
            "id": "fix-approval",
            "label": "Fix approved",
            "source": "approval"
          }
        ],
        "approval": "required",
        "outputs": [
          "Verification results"
        ],
        "modules": [
          {
            "id": "fix-review",
            "type": "guided-review",
            "label": "Verify the fix",
            "config": {
              "endpoint": "/api/channels/stage-review",
              "reviewKind": "issue",
              "subject": "fix",
              "artifactTitle": "Verification results",
              "approveTo": "closed",
              "reviseTo": "in_progress"
            }
          }
        ],
        "exitGates": [
          {
            "id": "verified-fix",
            "type": "artifact-exists",
            "label": "Fix review completed",
            "message": "Verify the fix before closing.",
            "toStates": [
              "closed"
            ],
            "config": {
              "title": "Verification results"
            }
          },
          {
            "id": "fix-approved",
            "type": "approval-recorded",
            "label": "Fix approved",
            "message": "Approve the verified fix before closing.",
            "toStates": [
              "closed"
            ],
            "config": {
              "kind": "stage.approval"
            }
          }
        ]
      },
      "closed": {
        "label": "Closed",
        "kind": "done",
        "terminal": true,
        "purpose": "The verified issue is complete and documented."
      },
      "wont_fix": {
        "label": "Won't fix",
        "kind": "dead",
        "terminal": true
      }
    },
    "transitions": {
      "open": [
        "triaged",
        "wont_fix"
      ],
      "triaged": [
        "in_progress",
        "blocked",
        "wont_fix"
      ],
      "in_progress": [
        "resolved",
        "blocked",
        "wont_fix"
      ],
      "blocked": [
        "in_progress",
        "wont_fix"
      ],
      "resolved": [
        "closed",
        "in_progress"
      ],
      "closed": [],
      "wont_fix": []
    },
    "workflows": {
      "categorize": {
        "label": "Categorize",
        "runsAt": "open",
        "kind": "prompt",
        "instruction": "Classify this issue (bug/task/feature), set a priority, and confirm which repo it targets.",
        "defaultOn": true
      },
      "scope-repo": {
        "label": "Scope in repo",
        "runsAt": "triaged",
        "kind": "prompt",
        "instruction": "Explore the target repo and identify the files/areas this issue affects. Write a thread plan of concrete steps."
      },
      "fix": {
        "label": "Implement fix",
        "runsAt": "in_progress",
        "kind": "prompt",
        "instruction": "Implement the fix in the target repo. Keep changes minimal and follow the repo's conventions."
      },
      "verify-fix": {
        "label": "Verify fix",
        "runsAt": "resolved",
        "kind": "command",
        "command": "npm test",
        "gates": true
      }
    }
  },
  "planning": {
    "label": "Planning",
    "version": 5,
    "description": "Define an outcome, develop a plan, challenge it, approve it, and hand it into execution.",
    "initial": "drafted",
    "states": {
      "drafted": {
        "label": "Frame",
        "kind": "start",
        "purpose": "Define the desired outcome, constraints, and decision owner.",
        "outputs": [
          "Planning brief"
        ]
      },
      "drafting": {
        "label": "Plan",
        "kind": "active",
        "purpose": "Turn the reviewed direction into a short, ordered execution plan.",
        "requirements": [
          {
            "id": "task-breakdown",
            "label": "Plan has at least two concrete, ordered tasks",
            "source": "task"
          }
        ],
        "outputs": [
          "Execution plan"
        ],
        "modules": [
          {
            "id": "plan-editor",
            "type": "task-list",
            "label": "Build the execution plan",
            "order": 10
          }
        ]
      },
      "blocked": {
        "label": "Blocked",
        "kind": "wait",
        "purpose": "Capture the unresolved constraint or decision."
      },
      "review": {
        "label": "Challenge",
        "kind": "wait",
        "purpose": "Surface risks, missing dependencies, and weak assumptions.",
        "requirements": [
          {
            "id": "reviewed-plan",
            "label": "Plan challenge completed",
            "source": "artifact"
          },
          {
            "id": "plan-approval",
            "label": "Plan approved",
            "source": "approval"
          }
        ],
        "approval": "required",
        "outputs": [
          "Reviewed plan"
        ],
        "modules": [
          {
            "id": "plan-challenge",
            "type": "guided-review",
            "label": "Challenge the plan",
            "order": 10,
            "config": {
              "endpoint": "/api/channels/stage-review",
              "reviewKind": "plan",
              "artifactTitle": "Reviewed plan",
              "approveTo": "accepted",
              "reviseTo": "drafting"
            }
          }
        ],
        "exitGates": [
          {
            "id": "reviewed-plan",
            "type": "artifact-exists",
            "label": "Plan challenge completed",
            "message": "Run the plan challenge before approving.",
            "toStates": [
              "accepted"
            ],
            "config": {
              "title": "Reviewed plan"
            }
          },
          {
            "id": "plan-approved",
            "type": "approval-recorded",
            "label": "Plan approved",
            "message": "Approve the reviewed plan before continuing.",
            "toStates": [
              "accepted"
            ],
            "config": {
              "kind": "stage.approval"
            }
          }
        ]
      },
      "accepted": {
        "label": "Approved",
        "kind": "done",
        "terminal": true,
        "purpose": "The plan is approved. Choose whether to execute it now, attach it to a project, or keep it for later.",
        "outputs": [
          "Approved task set"
        ],
        "modules": [
          {
            "id": "execution-handoff",
            "type": "execution-handoff",
            "label": "Choose what happens next",
            "order": 10
          }
        ]
      },
      "stopped": {
        "label": "Stopped",
        "kind": "dead",
        "terminal": true
      }
    },
    "transitions": {
      "drafted": [
        "drafting",
        "stopped"
      ],
      "drafting": [
        "review",
        "blocked",
        "stopped"
      ],
      "blocked": [
        "drafting",
        "stopped"
      ],
      "review": [
        "accepted",
        "drafting"
      ],
      "accepted": [],
      "stopped": []
    },
    "workflows": {
      "task-breakdown": {
        "label": "Task breakdown",
        "runsAt": "drafting",
        "kind": "prompt",
        "instruction": "Decompose the goal into concrete, ordered tasks.",
        "defaultOn": true
      },
      "estimate": {
        "label": "Estimate",
        "runsAt": "drafting",
        "kind": "prompt",
        "instruction": "Add a rough effort estimate per task."
      },
      "challenge": {
        "label": "Red-team",
        "runsAt": "review",
        "kind": "prompt",
        "instruction": "Argue against this plan — surface risks and failure modes."
      },
      "create-tasks": {
        "label": "Create tasks",
        "runsAt": "accepted",
        "kind": "command",
        "command": "obsidian-task"
      }
    }
  },
  "research": {
    "label": "Research",
    "version": 3,
    "description": "Frame a question, gather evidence, synthesize, verify, and publish.",
    "initial": "drafted",
    "states": {
      "drafted": {
        "label": "Frame",
        "kind": "start",
        "purpose": "Define the question, intended decision, and success criteria.",
        "requirements": [
          {
            "id": "research-question",
            "label": "Research question is explicit",
            "source": "task"
          }
        ],
        "outputs": [
          "Research brief"
        ],
        "modules": [
          {
            "id": "research-frame",
            "type": "guided-interview",
            "label": "Frame workspace",
            "order": 10,
            "config": {
              "schema": "research-frame",
              "endpoint": "/api/channels/frame"
            }
          },
          {
            "id": "personal-context",
            "type": "context-scan",
            "label": "Personal Context Scan",
            "order": 20,
            "config": {
              "endpoint": "/api/channels/context-scan",
              "continueTo": "searching",
              "sources": [
                "graph",
                "previous-threads",
                "obsidian",
                "agent-brain",
                "life-os"
              ]
            }
          }
        ],
        "exitGates": [
          {
            "id": "frame-approved",
            "type": "interaction-approved",
            "label": "Research frame approved",
            "message": "Approve the research frame before continuing.",
            "toStates": [
              "searching"
            ],
            "config": {
              "kind": "frame.proposal"
            }
          },
          {
            "id": "context-reviewed",
            "type": "context-reviewed",
            "label": "Personal context reviewed",
            "message": "Review or skip Personal Context before continuing.",
            "toStates": [
              "searching"
            ]
          }
        ]
      },
      "searching": {
        "label": "Gather",
        "kind": "active",
        "purpose": "Collect relevant evidence and record where it came from.",
        "requirements": [
          {
            "id": "source-collection",
            "label": "Evidence sources collected",
            "source": "artifact"
          }
        ],
        "outputs": [
          "Source collection"
        ],
        "modules": [
          {
            "id": "source-collection",
            "type": "source-collection",
            "label": "Evidence collection",
            "order": 10
          },
          {
            "id": "research-agent",
            "type": "agent-run",
            "label": "Research agent",
            "order": 20,
            "config": {
              "capability": "web-research"
            }
          }
        ]
      },
      "synthesizing": {
        "label": "Synthesize",
        "kind": "active",
        "purpose": "Turn evidence into claims, tradeoffs, and a recommendation.",
        "requirements": [
          {
            "id": "claims-table",
            "label": "Claims trace back to evidence",
            "source": "artifact"
          }
        ],
        "outputs": [
          "Claims table",
          "Recommendation"
        ],
        "modules": [
          {
            "id": "claims-editor",
            "type": "artifact-editor",
            "label": "Claims and recommendation",
            "config": {
              "schema": "claims-table"
            }
          }
        ]
      },
      "blocked": {
        "label": "Blocked",
        "kind": "wait",
        "purpose": "Record the missing evidence or decision needed to continue."
      },
      "review": {
        "label": "Verify",
        "kind": "wait",
        "purpose": "Check citations, challenge the synthesis, and approve publication.",
        "requirements": [
          {
            "id": "verified-brief",
            "label": "Evidence verification completed",
            "source": "artifact"
          },
          {
            "id": "research-approval",
            "label": "Publication approved",
            "source": "approval"
          }
        ],
        "approval": "required",
        "outputs": [
          "Verified brief"
        ],
        "modules": [
          {
            "id": "research-verification",
            "type": "guided-review",
            "label": "Verify the synthesis",
            "config": {
              "endpoint": "/api/channels/stage-review",
              "reviewKind": "research",
              "subject": "research synthesis",
              "artifactTitle": "Verified brief",
              "approveTo": "accepted",
              "reviseTo": "searching"
            }
          }
        ],
        "exitGates": [
          {
            "id": "verified-brief",
            "type": "artifact-exists",
            "label": "Evidence verification completed",
            "message": "Verify the evidence and synthesis before publishing.",
            "toStates": [
              "accepted"
            ],
            "config": {
              "title": "Verified brief"
            }
          },
          {
            "id": "publication-approved",
            "type": "approval-recorded",
            "label": "Publication approved",
            "message": "Approve the verified brief before publishing.",
            "toStates": [
              "accepted"
            ],
            "config": {
              "kind": "stage.approval"
            }
          }
        ]
      },
      "accepted": {
        "label": "Published",
        "kind": "done",
        "terminal": true,
        "purpose": "The answer is durable, shareable, and available to future work.",
        "outputs": [
          "Final brief",
          "Memory checkpoint"
        ],
        "modules": [
          {
            "id": "publish-brief",
            "type": "publish",
            "label": "Publish and write back"
          }
        ]
      },
      "rejected": {
        "label": "Rejected",
        "kind": "dead",
        "terminal": true
      },
      "stopped": {
        "label": "Stopped",
        "kind": "dead",
        "terminal": true
      }
    },
    "transitions": {
      "drafted": [
        "searching",
        "stopped"
      ],
      "searching": [
        "synthesizing",
        "blocked",
        "stopped"
      ],
      "synthesizing": [
        "review",
        "searching",
        "stopped"
      ],
      "blocked": [
        "searching",
        "stopped"
      ],
      "review": [
        "accepted",
        "searching",
        "rejected"
      ],
      "accepted": [],
      "rejected": [],
      "stopped": []
    },
    "workflows": {
      "vault-first": {
        "label": "Vault first",
        "runsAt": "searching",
        "kind": "prompt",
        "instruction": "Check the existing vault notes before searching the web."
      },
      "cross-check": {
        "label": "Cross-check",
        "runsAt": "synthesizing",
        "kind": "prompt",
        "instruction": "Verify each claim across at least two independent sources.",
        "defaultOn": true
      },
      "cite-verify": {
        "label": "Verify citations",
        "runsAt": "review",
        "kind": "prompt",
        "instruction": "Confirm every cited URL resolves and supports the claim.",
        "defaultOn": true
      },
      "save-to-vault": {
        "label": "Save to vault",
        "runsAt": "accepted",
        "kind": "command",
        "command": "obsidian-save"
      }
    }
  }
};

export const DEFAULT_LIFECYCLE = "coding";

export function registerLifecycleDefinition(key: string, definition: Lifecycle): void {
  const errors = validateLifecycleDefinition(key, definition);
  if (errors.length) throw new Error(errors.join("; "));
  LIFECYCLES[key] = definition;
}

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
    const errors = validateLifecycleDefinition(key, lc);
    if (errors.length) throw new Error(errors.join("; "));
  }
}

export function validateLifecycleDefinition(key: string, lc: Lifecycle): string[] {
  const errors: string[] = [];
  if (!key.trim()) errors.push("lifecycle id missing");
  if (!lc.states?.[lc.initial]) errors.push(`${key}: initial '${lc.initial}' missing`);
  if (!Number.isInteger(lc.version) || lc.version < 1) errors.push(`${key}: invalid version`);
  if (!lc.label?.trim()) errors.push(`${key}: label missing`);
  if (!lc.description?.trim()) errors.push(`${key}: description missing`);
  if (!lc.states || typeof lc.states !== "object") return [...errors, `${key}: states missing`];
  if (!lc.transitions || typeof lc.transitions !== "object") return [...errors, `${key}: transitions missing`];
  if (!lc.workflows || typeof lc.workflows !== "object") return [...errors, `${key}: workflows missing`];
  for (const [from, tos] of Object.entries(lc.transitions)) {
    if (!lc.states[from]) errors.push(`${key}: transition from unknown '${from}'`);
    for (const to of tos) if (!lc.states[to]) errors.push(`${key}: '${from}'->unknown '${to}'`);
    if (lc.states[from]?.terminal && tos.length) errors.push(`${key}: terminal '${from}' has out-edges`);
  }
  for (const [id, w] of Object.entries(lc.workflows)) {
    if (!lc.states[w.runsAt]) errors.push(`${key}: workflow '${id}' runsAt unknown '${w.runsAt}'`);
  }
  for (const [stateId, state] of Object.entries(lc.states)) {
    const moduleIds = new Set<string>();
    for (const module of state.modules || []) {
      if (moduleIds.has(module.id)) errors.push(`${key}.${stateId}: duplicate module '${module.id}'`);
      moduleIds.add(module.id);
    }
    const gateIds = new Set<string>();
    for (const gate of state.exitGates || []) {
      if (gateIds.has(gate.id)) errors.push(`${key}.${stateId}: duplicate gate '${gate.id}'`);
      gateIds.add(gate.id);
    }
  }
  return errors;
}

export function stageDefinition(lifecycleKey: string, state: string): LifecycleState | null {
  return LIFECYCLES[lifecycleKey]?.states[state] ?? null;
}

export function stageModules(lifecycleKey: string, state: string): StageModule[] {
  return [...(stageDefinition(lifecycleKey, state)?.modules || [])]
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function hasStageModule(lifecycleKey: string, state: string, type: StageModuleType): boolean {
  return stageModules(lifecycleKey, state).some((module) => module.type === type);
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
  stepIndex: number;
  stepCount: number;
  stateLabel: string;
  stateKind: StateKind;
  nextHint: string | null;
  legalNextStates: string[];
  isTerminal: boolean;
  onMainPath: boolean;
}

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
        const candidate = lc.states[to];
        return candidate && candidate.kind !== "dead";
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
