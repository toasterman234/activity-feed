"use client";

import { LIFECYCLES, mainPathOrder, stageModules } from "./lifecycles";
import { StageReviewWorkspace } from "./StageReviewWorkspace";
import { ExecutionHandoffWorkspace } from "./ExecutionHandoffWorkspace";
import { CodingExecutionWorkspace } from "./CodingExecutionWorkspace";
import { WorkflowStageModules } from "./WorkflowStageModules";
import type { ThreadMetaRow, ThreadPlanRow, ThreadArtifactRow, StageInteractionRow, ActivityEventRow } from "./shapes";

export function ThreadStageStack({
  lifecycleKey,
  currentState,
  meta,
  channelId,
  threadId,
  plans,
  artifacts,
  interactions,
  scans,
  candidates,
  activity,
  onRefresh,
  isArchived,
}: {
  lifecycleKey: string;
  currentState: string;
  meta: ThreadMetaRow;
  channelId: string;
  threadId: string;
  plans: ThreadPlanRow[];
  artifacts: ThreadArtifactRow[];
  interactions: StageInteractionRow[];
  scans: Record<string, unknown>[];
  candidates: Record<string, unknown>[];
  activity: ActivityEventRow[];
  onRefresh: () => Promise<void>;
  isArchived?: boolean;
}) {
  const lc = LIFECYCLES[lifecycleKey];
  if (!lc) return null;

  const mainPath = mainPathOrder(lc);
  const currentIndex = mainPath.indexOf(currentState);
  const completedStates = currentIndex >= 0 ? mainPath.slice(0, currentIndex) : [];

  const currentStageModules = stageModules(lifecycleKey, currentState);
  const guidedReview = currentStageModules.find((module) => module.type === "guided-review");
  const executionHandoff = currentStageModules.find((module) => module.type === "execution-handoff");
  const showCodingWorkspace =
    lifecycleKey === "coding" &&
    (currentState === "drafted" || currentState === "running") &&
    meta;

  return (
    <>
      {/* Completed main-path stages collapsed into compact chips */}
      {completedStates.map((stateId) => {
        const stateDef = lc.states[stateId];
        if (!stateDef || stateDef.kind === "dead" || stateDef.terminal) return null;
        return (
          <div
            key={stateId}
            className="mb-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/50"
          >
            <p className="text-[11px] text-zinc-500">
              <span className="mr-1 text-emerald-500">✓</span>
              {stateDef.label}
              <span className="ml-1 text-zinc-400">· done</span>
            </p>
          </div>
        );
      })}

      {/* Active expanded workspace */}
      <div id="active-stage-workspace">
        {guidedReview && !isArchived && (
          <StageReviewWorkspace
            threadId={threadId}
            channelId={channelId}
            stageId={currentState}
            endpoint={String(guidedReview.config?.endpoint || "/api/channels/stage-review")}
            subject={String(guidedReview.config?.subject || "work")}
            plans={plans}
            artifacts={artifacts}
            interactions={interactions}
            activity={activity}
            onRefresh={onRefresh}
          />
        )}

        {showCodingWorkspace && !isArchived && (
          <CodingExecutionWorkspace
            threadId={threadId}
            channelId={channelId}
            meta={meta}
            plans={plans}
            currentState={currentState}
            onRefresh={onRefresh}
          />
        )}

        {/* Catch-all: any module type not handled above (task-list, guided-interview, etc.) */}
        {currentStageModules.filter(
          (module) => module.type !== "guided-review" && module.type !== "execution-handoff",
        ).length > 0 && !isArchived && (
          <WorkflowStageModules
            lifecycleKey={lifecycleKey}
            stageId={currentState}
            threadId={threadId}
            channelId={channelId}
            plans={plans}
            artifacts={artifacts}
            interactions={interactions}
            scans={scans}
            candidates={candidates}
            onRefresh={onRefresh}
          />
        )}

        {executionHandoff && !isArchived && (
          <div id="execution-handoff-workspace">
            <ExecutionHandoffWorkspace
              threadId={threadId}
              channelId={channelId}
              plans={plans}
              onRefresh={onRefresh}
            />
          </div>
        )}
      </div>
    </>
  );
}
