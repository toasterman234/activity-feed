"use client";

import type { ReactNode } from "react";
import { LIFECYCLES } from "./lifecycles";
import { PromoteStatusPanel } from "./PromoteStatusPanel";
import { RESEARCH_MODES } from "./researchModes";
import { StateFlow } from "./StateFlow";
import type { ThreadMetaRow, ThreadPromotionRow } from "./shapes";
import { FinancePublisherPanel } from "./FinancePublisherPanel";

export type ThreadOverviewTabProps = {
  lifecyclePicked: boolean;
  lifecycleKey: string;
  currentState: string;
  meta: ThreadMetaRow | null;
  suggestedLifecycle: string;
  enabledWorkflows: string[];
  researchMode: string;
  isArchived: boolean;
  isPromoted: boolean;
  isPromoting: boolean;
  promotion: ThreadPromotionRow | null;
  promoteAnyway: boolean;
  promotedTo: string | null;
  repoId: string | null;
  threadId: string;
  promotionFailed: boolean;
  showPromoteDialog: boolean;
  onAcceptSuggestedLifecycle: () => void;
  onLifecycleChange: (nextLifecycle: string) => void;
  onResearchModeChange: (modeId: string) => void;
  onToggleWorkflow: (workflowId: string) => void;
  onPromoteClick: () => void;
  onRetryPromote: () => void;
  onEditPromotePath: () => void;
  onDismissPromotion: () => void;
  onForcePromoteAnyway: () => void;
  issueHeader?: ReactNode;
};

export function ThreadOverviewTab({
  lifecyclePicked,
  lifecycleKey,
  currentState,
  meta,
  suggestedLifecycle,
  enabledWorkflows,
  researchMode,
  isArchived,
  isPromoted,
  isPromoting,
  promotion,
  promoteAnyway,
  promotedTo,
  repoId,
  threadId,
  promotionFailed,
  showPromoteDialog,
  onAcceptSuggestedLifecycle,
  onLifecycleChange,
  onResearchModeChange,
  onToggleWorkflow,
  onPromoteClick,
  onRetryPromote,
  onEditPromotePath,
  onDismissPromotion,
  onForcePromoteAnyway,
  issueHeader,
}: ThreadOverviewTabProps) {
  const lc = LIFECYCLES[lifecycleKey];
  const isTerminal = lc?.states[currentState]?.terminal === true;
  const canPromote = !isPromoting && !promotionFailed && !isPromoted && !isArchived;
  // Terminal promote CTA lives on StageActionBar; Overview only keeps promote-anyway override.
  const showPromoteButton = canPromote && promoteAnyway && !isTerminal;
  const showPromoteAnywayHint = canPromote && !isTerminal && !promoteAnyway;

  return (
    <div className="space-y-3">
      {!lifecyclePicked && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950">
          <span className="text-[10px] font-medium uppercase tracking-wide text-blue-500">Suggestion</span>
          <span className="text-xs text-blue-700 dark:text-blue-300">
            Looks like a {LIFECYCLES[suggestedLifecycle]?.label || "coding"} task — run it as a {" "}
            {LIFECYCLES[suggestedLifecycle]?.label || "Coding"} flow?
          </span>
          <button
            type="button"
            onClick={onAcceptSuggestedLifecycle}
            className="ml-auto shrink-0 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800"
          >
            Accept
          </button>
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) onLifecycleChange(e.target.value); }}
            className="text-xs rounded border border-blue-200 bg-white px-2 py-0.5 text-zinc-500 dark:border-blue-800 dark:bg-zinc-800 dark:text-zinc-400"
          >
            <option value="" disabled>Or pick…</option>
            {Object.entries(LIFECYCLES).map(([key, lcDef]) => (
              <option key={key} value={key}>{lcDef.label}</option>
            ))}
          </select>
        </div>
      )}

      {lifecyclePicked && lc && (
        <details className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900" open>
          <summary className="cursor-pointer text-xs text-zinc-600 dark:text-zinc-300 [&::-webkit-details-marker]:hidden">
            <span className="mr-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">Details</span>
            {lc.label} · {lc.states[currentState]?.label || currentState}
            <span className="ml-1.5 text-[10px] text-zinc-400">
              · {enabledWorkflows.length} workflow{enabledWorkflows.length === 1 ? "" : "s"}
            </span>
          </summary>
          <div className="mt-2.5 space-y-2.5 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <select
                value={lifecycleKey}
                disabled={meta ? meta.state !== "drafted" : false}
                onChange={(e) => onLifecycleChange(e.target.value)}
                className="text-xs rounded border border-zinc-200 bg-white px-2 py-0.5 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {Object.entries(LIFECYCLES).map(([key, lcDef]) => (
                  <option key={key} value={key}>{lcDef.label}</option>
                ))}
              </select>
              {meta && meta.state !== "drafted" && (
                <span className="text-[10px] text-zinc-400">(locked — state is {currentState})</span>
              )}
            </div>

            {lifecycleKey === "research" && (
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">Research style</p>
                <select
                  value={researchMode}
                  onChange={(e) => onResearchModeChange(e.target.value)}
                  className="text-xs rounded border border-zinc-200 bg-white px-2 py-0.5 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {Object.values(RESEARCH_MODES).map((mode) => (
                    <option key={mode.id} value={mode.id}>{mode.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-zinc-400">{RESEARCH_MODES[researchMode]?.description}</p>
              </div>
            )}

            {Object.keys(lc.workflows).length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">Workflows</p>
                <div className="space-y-0.5">
                  {Object.entries(lc.workflows).map(([wfId, wf]) => (
                    <label key={wfId} className="flex cursor-pointer items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={enabledWorkflows.includes(wfId)}
                        onChange={() => onToggleWorkflow(wfId)}
                        className="h-3 w-3 rounded border-zinc-300"
                      />
                      <span className="text-zinc-600 dark:text-zinc-300">{wf.label}</span>
                      <span className="text-[10px] text-zinc-400">
                        @ {wf.runsAt}
                        {wf.gates && " · gates"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <StateFlow lifecycleKey={lifecycleKey} currentState={currentState} />

          </div>
        </details>
      )}

      {lifecyclePicked && !showPromoteDialog && (!isArchived || isPromoted) && (
        <PromoteStatusPanel
          promotion={promotion}
          promotedTo={promotedTo}
          repoId={repoId}
          retrying={isPromoting}
          onRetry={onRetryPromote}
          onEditPath={onEditPromotePath}
          onDismiss={onDismissPromotion}
          onPromoteClick={onPromoteClick}
          showPromoteButton={showPromoteButton}
          promoteAnywayHint={
            showPromoteAnywayHint ? (
              <button
                type="button"
                onClick={onForcePromoteAnyway}
                className="text-[10px] text-zinc-400 underline hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                Thread not in a terminal state (currently: {lc?.states[currentState]?.label || currentState}). Promote anyway?
              </button>
            ) : null
          }
        />
      )}

      {lifecyclePicked && lifecycleKey === "research" && !isArchived && (
        <FinancePublisherPanel threadId={threadId} currentState={currentState} />
      )}

      {issueHeader}
    </div>
  );
}
