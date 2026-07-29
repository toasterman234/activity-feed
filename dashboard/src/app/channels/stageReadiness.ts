import type { StageRequirement } from "./lifecycles";
import { LIFECYCLES } from "./lifecycles";
import type { ThreadArtifactRow, ThreadPlanRow, WorkflowStepRow } from "./shapes";

export function requirementStatus(
  requirement: StageRequirement,
  currentState: string,
  plans: ThreadPlanRow[],
  artifacts: ThreadArtifactRow[],
  steps: WorkflowStepRow[],
): boolean {
  const stagePlans = plans.filter((item) => !item.stage_id || item.stage_id === currentState);
  const stageArtifacts = artifacts.filter((item) => !item.stage_id || item.stage_id === currentState);
  if (requirement.source === "task") {
    return stagePlans.length >= 2 && stagePlans.every((item, index) =>
      item.title.trim().length >= 8 && item.sort_order === index
    );
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
    .filter((req) => !requirementStatus(req, currentState, plans, artifacts, steps))
    .map((req) => req.label);
  return { incompleteLabels };
}
