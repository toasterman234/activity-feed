"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActivityEventRow, StageInteractionRow, ThreadArtifactRow, ThreadPlanRow } from "./shapes";

type Review = {
  summary: string;
  strengths: string[];
  risks: Array<{ issue: string; impact: string; recommendation: string }>;
  decisionsNeeded: string[];
  grounding?: {
    evidence: string[];
    unverifiedAssumptions: string[];
  };
  revisedPlan: string[];
};

function parseReviewPayload(payload: unknown): Review | null {
  try {
    const raw = typeof payload === "string" ? JSON.parse(payload || "{}") : (payload || {});
    const review = (raw as { review?: Review }).review;
    return review?.summary ? review : null;
  } catch {
    return null;
  }
}

export function StageReviewWorkspace({
  threadId,
  channelId,
  stageId,
  endpoint,
  subject,
  plans,
  artifacts,
  interactions,
  activity = [],
  onRefresh,
}: {
  threadId: string;
  channelId: string;
  stageId: string;
  endpoint: string;
  subject: string;
  plans: ThreadPlanRow[];
  artifacts: ThreadArtifactRow[];
  interactions: StageInteractionRow[];
  activity?: ActivityEventRow[];
  onRefresh: () => Promise<void>;
}) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<"run" | "feedback" | "approve" | "revise" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const activeProposal = useMemo(() => [...interactions].reverse().find(
      (item) => item.stage_id === stageId && item.kind === "review.proposal" && item.status !== "superseded",
    ) || null, [interactions, stageId]);
  const review = useMemo(() => activeProposal ? parseReviewPayload(activeProposal.payload) : null, [activeProposal]);
  const latestError = useMemo(() => [...interactions].reverse().find(
    (item) => item.stage_id === stageId && item.kind === "review.error",
  ) || null, [interactions, stageId]);
  const revisionApplied = useMemo(() => interactions.some(
    (item) => item.stage_id === stageId &&
      item.kind === "review.revision_applied" &&
      item.status === "applied" &&
      (!activeProposal || item.created_at >= activeProposal.created_at),
  ), [interactions, stageId, activeProposal]);
  const duplicates = Math.max(0, plans.length - new Set(plans.map((plan) => plan.title.toLowerCase())).size);

  const runEvents = useMemo(() => {
    if (!activity.length) return [] as ActivityEventRow[];
    const runId = activeRunId && !activeRunId.startsWith("pending-")
      ? activeRunId
      : activity[activity.length - 1]?.run_id;
    if (!runId) return [];
    return activity.filter((event) => event.run_id === runId);
  }, [activity, activeRunId]);
  const latestEvent = runEvents[runEvents.length - 1] || null;
  const activityRunning = Boolean(busy === "run" || busy === "feedback") || runEvents.some((event) => event.status === "running");

  useEffect(() => {
    if (!busy && !activityRunning) return;
    const id = setInterval(() => { void onRefresh(); }, 1200);
    return () => clearInterval(id);
  }, [busy, activityRunning, onRefresh]);

  useEffect(() => {
    if (busy && review) setBusy(null);
  }, [busy, review]);

  const post = async (action: "run" | "feedback" | "approve" | "revise") => {
    setBusy(action);
    setError(null);
    if (action === "run" || action === "feedback") {
      setActiveRunId(`pending-${Date.now()}`);
    }
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, channelId, action, feedback: feedback.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      if (typeof data.runId === "string") setActiveRunId(data.runId);
      setFeedback("");
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      await onRefresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-amber-300 bg-card p-3 shadow-[0_10px_30px_rgba(24,24,27,0.05)] dark:border-amber-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">Challenge workspace</p>
          <h3 className="mt-0.5 text-base font-semibold">Review and approve the {subject}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
            Turn the material already in this task into one coherent, risk-checked decision.
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-2 py-1 font-mono text-[9px] text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          decision required
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
          <p className="font-mono text-[9px] uppercase text-zinc-400">Proposed tasks</p>
          <p className="mt-1 text-xl font-semibold">{plans.length}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
          <p className="font-mono text-[9px] uppercase text-zinc-400">Existing outputs</p>
          <p className="mt-1 text-xl font-semibold">{artifacts.length}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
          <p className="font-mono text-[9px] uppercase text-zinc-400">Exact duplicates</p>
          <p className="mt-1 text-xl font-semibold">{duplicates}</p>
        </div>
      </div>

      {(busy || activityRunning || latestEvent) && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <span className={activityRunning ? "animate-pulse text-amber-500" : latestEvent?.status === "error" ? "text-red-500" : "text-emerald-500"}>
              {activityRunning ? "●" : latestEvent?.status === "error" ? "✕" : "✓"}
            </span>
            <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100">
              {latestEvent?.label || (busy ? `Running ${subject} review…` : "Agent activity")}
            </p>
          </div>
          {latestEvent?.detail && (
            <p className="mt-1 text-[11px] leading-5 text-zinc-500">{latestEvent.detail}</p>
          )}
          {runEvents.length > 1 && (
            <ol className="mt-2 space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
              {runEvents.slice(-6).map((event) => (
                <li key={event.id} className="flex gap-2 text-[11px] text-zinc-500">
                  <span className="font-mono text-zinc-400">{event.seq}</span>
                  <span>{event.label}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {!review ? (
        <div className="mt-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-sm font-medium">Next action: review the {subject}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            The agent will inspect the conversation, tasks, and artifacts, identify gaps and risks, and propose a decision-ready review here.
          </p>
          <button
            type="button"
            onClick={() => { void post("run"); }}
            disabled={busy !== null}
            className="mt-3 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {busy === "run" || activityRunning ? "Running review…" : `Review ${subject}`}
          </button>
          {latestError && !busy && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{latestError.content}</p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="font-mono text-[9px] uppercase text-zinc-400">Assessment</p>
            <p className="mt-1 text-sm leading-6">{review.summary}</p>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="font-mono text-[9px] uppercase text-zinc-400">Risks and corrections</p>
              <div className="mt-2 space-y-2">
                {review.risks.map((risk) => (
                  <div key={risk.issue} className="rounded-lg border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-900 dark:bg-amber-950/20">
                    <p className="text-xs font-semibold">{risk.issue}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">{risk.impact}</p>
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{risk.recommendation}</p>
                  </div>
                ))}
                {review.risks.length === 0 && (
                  <p className="text-xs text-zinc-400">No risks recorded.</p>
                )}
              </div>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase text-zinc-400">Consolidated plan</p>
              <ol className="mt-2 space-y-1.5">
                {review.revisedPlan.map((item, index) => (
                  <li key={`${index}-${item}`} className="flex gap-2 text-xs leading-5">
                    <span className="font-mono text-zinc-400">{index + 1}.</span><span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          {((review.grounding?.evidence?.length || 0) > 0 || (review.grounding?.unverifiedAssumptions?.length || 0) > 0) && (
            <div className="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="font-mono text-[9px] uppercase text-zinc-400">Grounding</p>
              <ul className="mt-1 space-y-1">
                {(review.grounding?.evidence || []).map((item) => (
                  <li key={`e-${item}`} className="text-xs text-emerald-700 dark:text-emerald-300">• Evidence: {item}</li>
                ))}
                {(review.grounding?.unverifiedAssumptions || []).map((item) => (
                  <li key={`u-${item}`} className="text-xs text-amber-700 dark:text-amber-300">• Unverified: {item}</li>
                ))}
              </ul>
            </div>
          )}
          {review.decisionsNeeded.length > 0 && (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/30">
              <p className="font-mono text-[9px] uppercase text-sky-600">Decisions still needed</p>
              <ul className="mt-1 space-y-1">
                {review.decisionsNeeded.map((item) => <li key={item} className="text-xs">• {item}</li>)}
              </ul>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <input
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Ask for a change or answer a decision…"
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            <button type="button" disabled={!feedback.trim() || busy !== null} onClick={() => { void post("feedback"); }} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs disabled:opacity-40 dark:border-zinc-700">
              {busy === "feedback" ? "Revising…" : "Update review"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => { void post("approve"); }} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
              {busy === "approve" ? "Approving…" : `Approve ${subject}`}
            </button>
            <button type="button" disabled={busy !== null || (subject === "plan" && revisionApplied)} onClick={() => { void post("revise"); }} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs disabled:opacity-50 dark:border-zinc-700">
              {busy === "revise"
                ? subject === "plan" ? "Applying…" : "Moving…"
                : subject === "plan"
                  ? revisionApplied ? "Revised plan applied ✓" : "Apply revised plan"
                  : "Send back for revision"}
            </button>
          </div>
        </>
      )}
      {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
