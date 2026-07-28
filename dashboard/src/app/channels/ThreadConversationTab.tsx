"use client";

import Link from "next/link";
import { useState } from "react";
import { MentionInput, MessageBody, type MentionOption } from "./MentionInput";
import {
  relativeTime,
  type ContinuitySummary,
  type GraphDecisionRow,
  type GraphEventRow,
  type GraphObservationRow,
  type GraphProposalRow,
  type MessageRow,
} from "./shapes";

export type ThreadConversationTabProps = {
  threadMsg: MessageRow;
  replies: MessageRow[];
  graphEvents: GraphEventRow[];
  graphDecisions: GraphDecisionRow[];
  graphObservations: GraphObservationRow[];
  graphProposals: GraphProposalRow[];
  continuity: ContinuitySummary;
  replyBody: string;
  onReplyBodyChange: (value: string) => void;
  onSubmitReply: () => void;
  mentionOptions: MentionOption[];
  sending: boolean;
  isArchived: boolean;
};

type TimelineItem =
  | { kind: "reply"; created_at: string; data: MessageRow }
  | { kind: "graph_event"; created_at: string; data: GraphEventRow }
  | { kind: "graph_decision"; created_at: string; data: GraphDecisionRow }
  | { kind: "graph_observation"; created_at: string; data: GraphObservationRow }
  | { kind: "graph_proposal"; created_at: string; data: GraphProposalRow };

function parseJsonArray(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderTimelineItem(item: TimelineItem) {
  if (item.kind === "reply") {
    const reply = item.data;
    return (
      <div key={reply.id} className="rounded-lg border border-zinc-100 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{reply.author}</span>
          <span className="text-[10px] text-zinc-400">{relativeTime(reply.created_at)}</span>
        </div>
        <MessageBody body={reply.body} className="whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400" />
      </div>
    );
  }

  if (item.kind === "graph_decision") {
    const decision = item.data;
    const evidenceCount = parseJsonArray(decision.evidence).length;
    return (
      <div key={`${item.kind}-${decision.id}`} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] dark:border-amber-800 dark:bg-amber-950/40">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-amber-900 dark:text-amber-100">📋 Decision</span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{relativeTime(decision.created_at)}</span>
        </div>
        <p className="mt-1 text-zinc-700 dark:text-zinc-200">{decision.statement}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
          <span>status: {decision.status}</span>
          {decision.rationale && <span>rationale: {decision.rationale}</span>}
          <span>evidence: {evidenceCount}</span>
        </div>
        {decision.supersedes_statement && (
          <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">Supersedes: {decision.supersedes_statement}</p>
        )}
        {decision.resolution_rationale && (
          <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">Resolution: {decision.resolution_rationale}</p>
        )}
      </div>
    );
  }

  if (item.kind === "graph_proposal") {
    const proposal = item.data;
    const capabilityCount = parseJsonArray(proposal.capability_ids).length;
    const evidenceCount = parseJsonArray(proposal.evidence).length;
    const changeCount = parseJsonArray(proposal.changes).length;
    return (
      <div key={`${item.kind}-${proposal.id}`} className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-2.5 text-[11px] dark:border-fuchsia-800 dark:bg-fuchsia-950/40">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-fuchsia-900 dark:text-fuchsia-100">🧪 Proposal</span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{relativeTime(proposal.created_at)}</span>
        </div>
        <p className="mt-1 text-zinc-700 dark:text-zinc-200">{proposal.hypothesis}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
          <span>status: {proposal.status}</span>
          <span>capabilities: {capabilityCount}</span>
          <span>changes: {changeCount}</span>
          <span>evidence: {evidenceCount}</span>
        </div>
        {proposal.resolution_rationale && (
          <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">Resolution: {proposal.resolution_rationale}</p>
        )}
      </div>
    );
  }

  if (item.kind === "graph_observation") {
    const observation = item.data;
    return (
      <div key={`${item.kind}-${observation.id}`} className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-[11px] dark:border-blue-800 dark:bg-blue-950/40">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-blue-900 dark:text-blue-100">🔍 Observation</span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{relativeTime(observation.created_at)}</span>
        </div>
        <p className="mt-1 text-zinc-700 dark:text-zinc-200">{observation.text}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
          <span>category: {observation.category}</span>
          {typeof observation.confidence === "number" && <span>confidence: {observation.confidence.toFixed(2)}</span>}
        </div>
      </div>
    );
  }

  const event = item.data;
  let payloadSummary = "";
  try {
    const payload = JSON.parse(event.payload || "{}");
    const keys = Object.entries(payload)
      .filter(([, value]) => !!value)
      .map(([key]) => key);
    if (keys.length > 0) payloadSummary = keys.join(" · ");
  } catch {
    payloadSummary = "";
  }

  return (
    <div key={`${item.kind}-${event.id}`} className="rounded-lg border border-purple-200 bg-purple-50 p-2.5 text-[11px] dark:border-purple-800 dark:bg-purple-950/40">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-purple-900 dark:text-purple-100">📎 Event</span>
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{relativeTime(event.created_at)}</span>
      </div>
      <p className="mt-1 text-zinc-700 dark:text-zinc-200">{event.kind.replace(/_/g, " ")}</p>
      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
        <span>actor: {event.actor}</span>
        {payloadSummary && <span>{payloadSummary}</span>}
      </div>
    </div>
  );
}

export function ThreadConversationTab({
  threadMsg,
  replies,
  graphEvents,
  graphDecisions,
  graphObservations,
  graphProposals,
  continuity,
  replyBody,
  onReplyBodyChange,
  onSubmitReply,
  mentionOptions,
  sending,
  isArchived,
}: ThreadConversationTabProps) {
  const [showContinuity, setShowContinuity] = useState(false);
  const [creatingDecision, setCreatingDecision] = useState(false);

  const replyItems: TimelineItem[] = replies
    .map((reply) => ({ kind: "reply" as const, created_at: reply.created_at, data: reply }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const continuityItems: TimelineItem[] = [
    ...graphEvents.map((event) => ({ kind: "graph_event" as const, created_at: event.created_at, data: event })),
    ...graphDecisions.map((decision) => ({ kind: "graph_decision" as const, created_at: decision.created_at, data: decision })),
    ...graphObservations.map((observation) => ({
      kind: "graph_observation" as const,
      created_at: observation.created_at,
      data: observation,
    })),
    ...graphProposals.map((proposal) => ({
      kind: "graph_proposal" as const,
      created_at: proposal.created_at,
      data: proposal,
    })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const visibleItems = showContinuity
    ? [...replyItems, ...continuityItems].sort((a, b) => a.created_at.localeCompare(b.created_at))
    : replyItems;

  const hasContinuity = !!continuity.checkpoint
    || continuity.activeDecisions.length > 0
    || continuity.acceptedMemory.length > 0
    || continuity.pendingDecisionCount > 0
    || continuity.pendingProposalCount > 0
    || continuity.pendingMemoryCount > 0
    || continuityItems.length > 0;

  const checkpointText = continuity.checkpoint?.text || "No checkpoint yet";
  const pendingTotal = continuity.pendingDecisionCount + continuity.pendingProposalCount + continuity.pendingMemoryCount;

  async function createDecision() {
    const statement = window.prompt("Decision statement", "");
    if (!statement?.trim()) return;
    const rationale = window.prompt("Optional rationale", "") || "";
    const supersedeChoices = continuity.activeDecisions.map((decision) => `${decision.id}: ${decision.statement}`).join("\n");
    const supersedes = continuity.activeDecisions.length > 0
      ? (window.prompt(`Optional decision id to supersede${supersedeChoices ? `\n\nActive decisions:\n${supersedeChoices}` : ""}`, "") || "").trim()
      : "";

    setCreatingDecision(true);
    try {
      const res = await fetch("/api/channels/graph-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          kind: "decision",
          channelId: threadMsg.channel_id,
          threadId: threadMsg.thread_id || threadMsg.id,
          statement: statement.trim(),
          rationale: rationale.trim() || null,
          supersedes: supersedes || null,
        }),
      });
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || `Create decision failed: ${res.status}`);
    } catch (error) {
      window.alert(String(error));
    } finally {
      setCreatingDecision(false);
    }
  }

  return (
    <>
      {hasContinuity && (
        <div className="rounded-md border border-zinc-200 bg-white/80 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
            <span className="font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Continuity</span>
            <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">{checkpointText}</span>
            <span className="text-zinc-500 dark:text-zinc-400">{continuity.acceptedMemory.length} memory</span>
            <span className="text-zinc-500 dark:text-zinc-400">{continuity.activeDecisions.length} decisions</span>
            <span className="text-zinc-500 dark:text-zinc-400">{pendingTotal} pending</span>
            {pendingTotal > 0 && (
              <Link href="/channels/continuity/inbox" className="text-zinc-700 underline dark:text-zinc-200">
                Inbox
              </Link>
            )}
            <button
              type="button"
              onClick={() => { void createDecision(); }}
              disabled={creatingDecision}
              className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            >
              {creatingDecision ? "Saving…" : "Decide"}
            </button>
            {continuityItems.length > 0 && (
              <button
                type="button"
                onClick={() => setShowContinuity((value) => !value)}
                className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              >
                {showContinuity ? "Hide continuity" : `Show ${continuityItems.length} updates`}
              </button>
            )}
          </div>

          {showContinuity && (continuity.activeDecisions.length > 0 || continuity.acceptedMemory.length > 0) && (
            <div className="mt-2 grid gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800 lg:grid-cols-2">
              {continuity.activeDecisions.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Active decisions</p>
                  <ul className="space-y-1">
                    {continuity.activeDecisions.slice(0, 3).map((decision) => (
                      <li key={decision.id} className="text-xs text-zinc-700 dark:text-zinc-200">
                        • {decision.statement}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {continuity.acceptedMemory.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Accepted memory</p>
                  <ul className="space-y-1">
                    {continuity.acceptedMemory.slice(0, 3).map((memory) => (
                      <li key={memory.id} className="text-xs text-zinc-700 dark:text-zinc-200">
                        • <span className="text-zinc-500">[{memory.category}]</span> {memory.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{threadMsg.author}</span>
          <span className="text-[10px] text-zinc-400">{relativeTime(threadMsg.created_at)}</span>
        </div>
        <MessageBody body={threadMsg.body} className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300" />
      </div>

      <div className="space-y-2 pl-3">
        {visibleItems.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-400">No replies yet</p>
        ) : (
          visibleItems.map((item) => renderTimelineItem(item))
        )}

        {!showContinuity && continuityItems.length > 0 && (
          <button
            type="button"
            onClick={() => setShowContinuity(true)}
            className="w-full rounded-lg border border-dashed border-zinc-200 bg-white/70 px-3 py-2 text-left text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400"
          >
            {continuityItems.length} continuity updates hidden from the main thread. Tap to expand.
          </button>
        )}
      </div>

      <div className="sticky bottom-0 flex gap-1 border-t border-zinc-200 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-3xl gap-1">
          <MentionInput
            value={replyBody}
            onChange={onReplyBodyChange}
            onSubmit={onSubmitReply}
            placeholder={isArchived ? "Thread is archived — replies disabled" : "Reply… use @agent to trigger"}
            options={mentionOptions}
            disabled={sending || isArchived}
            className="min-w-0 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 disabled:opacity-50"
          />
          <button
            onClick={onSubmitReply}
            disabled={!replyBody.trim() || sending || isArchived}
            className="shrink-0 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
          >
            {sending ? "…" : "Reply"}
          </button>
        </div>
      </div>
    </>
  );
}
