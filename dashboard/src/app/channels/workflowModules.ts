import type { StageModule, StageModuleType } from "./lifecycles";

export interface WorkflowModuleDefinition {
  type: StageModuleType;
  surface: "inline" | "work" | "artifact" | "transition";
  description: string;
}

export const WORKFLOW_MODULE_REGISTRY: Record<StageModuleType, WorkflowModuleDefinition> = {
  "guided-interview": { type: "guided-interview", surface: "inline", description: "Progressive agent-led structured intake." },
  "guided-review": { type: "guided-review", surface: "inline", description: "Agent challenge, user feedback, revision, and explicit approval." },
  "context-scan": { type: "context-scan", surface: "inline", description: "Review and admit related personal context." },
  "agent-run": { type: "agent-run", surface: "work", description: "Run an agent with a named capability." },
  "source-collection": { type: "source-collection", surface: "artifact", description: "Collect source-attributed evidence." },
  "task-list": { type: "task-list", surface: "work", description: "Complete an ordered set of tasks." },
  "artifact-editor": { type: "artifact-editor", surface: "artifact", description: "Create a structured stage artifact." },
  approval: { type: "approval", surface: "transition", description: "Require an explicit user approval." },
  verification: { type: "verification", surface: "transition", description: "Run or record verification checks." },
  publish: { type: "publish", surface: "transition", description: "Publish outputs and write durable context." },
  "execution-handoff": { type: "execution-handoff", surface: "inline", description: "Bind an approved plan to a repo and create a linked execution task." },
};

export function validateStageModules(modules: StageModule[]): string[] {
  const errors: string[] = [];
  for (const module of modules) {
    if (!WORKFLOW_MODULE_REGISTRY[module.type]) errors.push(`Unknown module type: ${module.type}`);
    if (!module.id.trim()) errors.push("Module id is required");
    if (!module.label.trim()) errors.push(`Module '${module.id}' requires a label`);
  }
  return errors;
}
