"use client";

import { ResearchFrameWorkspace } from "./ResearchFrameWorkspace";
import { StageReviewWorkspace } from "./StageReviewWorkspace";
import { PlanWorkspace } from "./PlanWorkspace";
import { ExecutionHandoffWorkspace } from "./ExecutionHandoffWorkspace";
import { stageModules } from "./lifecycles";
import type { ContextCandidateRow, ContextScanRow, StageInteractionRow, ThreadArtifactRow, ThreadPlanRow } from "./shapes";

export function WorkflowStageModules({
  lifecycleKey,
  stageId,
  threadId,
  channelId,
  interactions,
  scans,
  candidates,
  plans,
  artifacts,
  onRefresh,
}: {
  lifecycleKey: string;
  stageId: string;
  threadId: string;
  channelId: string;
  interactions: StageInteractionRow[];
  scans: ContextScanRow[];
  candidates: ContextCandidateRow[];
  plans: ThreadPlanRow[];
  artifacts: ThreadArtifactRow[];
  onRefresh: () => Promise<void>;
}) {
  const modules = stageModules(lifecycleKey, stageId);
  const interview = modules.find((module) => module.type === "guided-interview");
  const contextScan = modules.find((module) => module.type === "context-scan");
  const guidedReview = modules.find((module) => module.type === "guided-review");
  const taskList = modules.find((module) => module.type === "task-list");
  const executionHandoff = modules.find((module) => module.type === "execution-handoff");

  if (interview) {
    return (
      <ResearchFrameWorkspace
        threadId={threadId}
        channelId={channelId}
        stageId={stageId}
        frameEndpoint={String(interview.config?.endpoint || "/api/channels/frame")}
        contextEndpoint={String(contextScan?.config?.endpoint || "/api/channels/context-scan")}
        interactions={interactions}
        scans={scans}
        candidates={candidates}
        onRefresh={onRefresh}
      />
    );
  }
  if (guidedReview) {
    return (
      <StageReviewWorkspace
        threadId={threadId}
        channelId={channelId}
        stageId={stageId}
        endpoint={String(guidedReview.config?.endpoint || "/api/channels/stage-review")}
        subject={String(guidedReview.config?.subject || "plan")}
        plans={plans}
        artifacts={artifacts}
        interactions={interactions}
        onRefresh={onRefresh}
      />
    );
  }
  if (taskList) {
    return (
      <PlanWorkspace
        threadId={threadId}
        channelId={channelId}
        stageId={stageId}
        plans={plans}
        onRefresh={onRefresh}
      />
    );
  }
  if (executionHandoff) {
    return (
      <ExecutionHandoffWorkspace
        threadId={threadId}
        channelId={channelId}
        plans={plans}
        onRefresh={onRefresh}
      />
    );
  }

  return null;
}
