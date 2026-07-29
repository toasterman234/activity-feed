import type { StageRequirement } from "./lifecycles";
import { LIFECYCLES, mainPathOrder } from "./lifecycles";
import type { ThreadArtifactRow, ThreadPlanRow, WorkflowStepRow } from "./shapes";

export function requirementStatus(
  requirement: StageRequirement,
  lifecycleKey: string,
  currentState: string,
  plans: ThreadPlanRow[],
  artifacts: ThreadArtifactRow[],
  steps: WorkflowStepRow[],
): boolean {
  const lc = LIFECYCLES[lifecycleKey];
  const mainPath = lc ? mainPathOrder(lc) : [];
  const currentIndex = mainPath.indexOf(currentState);
  // Allow plans tagged to current state, any prior state on the main path, or untagged.
  const planAllowlist = new Set(currentIndex >= 0 ? mainPath.slice(0, currentIndex + 1) : [currentState]);
  const stagePlans = plans.filter((item) => !item.stage_id || planAllowlist.has(item.stage_id));
  const stageArtifacts = artifacts.filter((item) => !item.stage_id || item.stage_id === currentState);
  if (requirement.source === "task") {
    return stagePlans.filter((item) => item.title.trim().length >= 8).length >= 1;
  }
  if (requirement.source === "artifact") return stageArtifacts.length > 0;
  if (requirement.source === "gate") {
    return steps.some((step) => step.status === "done" && (
      step.step_label.toLowerCase().includes(requirement.id.replace(/-/g, " ")) ||
      step.step_label.toLowerCase().includes(requirement.label.toLowerCase())
    ));
  }
  return false;
}

/** Soft client-side readiness for StageActionBar (server gates remain authoritative). */
export function stageReadiness(
  lifecycleKey: string,
  currentState: string,
  plans: ThreadPlanRow[],
  artifacts: ThreadArtifactRow[],
  steps: WorkflowStepRow[],
): { incompleteLabels: string[] } {
  const stage = LIFECYCLES[lifecycleKey]?.states[currentState];
  const requirements = stage?.requirements || [];
  const incompleteLabels = requirements
    .filter((req) => !req.optional)
    .filter((req) => !requirementStatus(req, lifecycleKey, currentState, plans, artifacts, steps))
    .map((req) => req.label);
  return { incompleteLabels };
}
