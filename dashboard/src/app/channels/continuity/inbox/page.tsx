"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { relativeTime } from "../../shapes";

type InboxDecision = {
  id: string;
  channel_id: string;
  thread_id: string | null;
  statement: string;
  rationale: string | null;
  evidence: string;
  status: string;
  supersedes: string | null;
  supersedes_statement: string | null;
  created_at: string;
  resolved_at: string | null;
  channel_name: string | null;
  thread_title: string | null;
};

type InboxProposal = {
  id: string;
  channel_id: string;
  thread_id: string | null;
  hypothesis: string;
  capability_ids: string;
  changes: string;
  evidence: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_rationale: string | null;
  channel_name: string | null;
  thread_title: string | null;
};

type InboxMemoryCandidate = {
  id: string;
  channel_id: string;
  thread_id: string | null;
  text: string;
  category: string;
  confidence: number | null;
  status: string;
  created_at: string;
  channel_name: string | null;
  thread_title: string | null;
};

function parseJsonArray(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function prettyJson(value: string | null | undefined): string {
  try {
    return JSON.stringify(JSON.parse(value || "[]"), null, 2);
  } catch {
    return value || "[]";
  }
}

export default function ChannelsInboxPage() {
  const [decisions, setDecisions] = useState<InboxDecision[]>([]);
  const [proposals, setProposals] = useState<InboxProposal[]>([]);
  const [memoryCandidates, setMemoryCandidates] = useState<InboxMemoryCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/channels/graph-inbox", { cache: "no-store" });
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || `Inbox failed: ${res.status}`);
      setDecisions((next.decisions || []) as InboxDecision[]);
      setProposals((next.proposals || []) as InboxProposal[]);
      setMemoryCandidates((next.memoryCandidates || []) as InboxMemoryCandidate[]);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolveItem = useCallback(async (opts: {
    kind: "decision" | "proposal" | "memory";
    id: string;
    status: string;
  }) => {
    const rationale = window.prompt(
      opts.status === "rejected" ? "Why are you rejecting this?" : "Optional rationale",
      "",
    ) || "";
    setActing(`${opts.kind}:${opts.id}:${opts.status}`);
    try {
      const res = await fetch("/api/channels/graph-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: opts.kind, id: opts.id, status: opts.status, resolutionRationale: rationale }),
      });
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || `Resolve failed: ${res.status}`);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setActing(null);
    }
  }, [refresh]);

  const total = decisions.length + proposals.length + memoryCandidates.length;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Graph Inbox</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            Review pending decisions, proposals, and memory candidates.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Pending review</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {decisions.length} decisions · {proposals.length} proposals · {memoryCandidates.length} memory candidates
              </p>
            </div>
            <button
              type="button"
              onClick={() => { void refresh(); }}
              className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              Refresh
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        {loading && total === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
            Loading inbox…
          </div>
        ) : null}

        {!loading && total === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
            Nothing pending.
          </div>
        ) : null}

        {decisions.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Decisions</h2>
              <span className="text-[11px] text-zinc-400">{decisions.length}</span>
            </div>
            {decisions.map((decision) => {
              const busy = acting?.startsWith(`decision:${decision.id}:`) || false;
              const evidenceCount = parseJsonArray(decision.evidence).length;
              return (
                <div key={decision.id} className="rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-800 dark:bg-zinc-900">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{decision.statement}</p>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        #{decision.channel_name || decision.channel_id} · {relativeTime(decision.created_at)} · evidence {evidenceCount}
                      </p>
                      {decision.thread_id && (
                        <Link href={`/channels/${decision.channel_id}/${decision.thread_id}`} className="mt-1 inline-block text-[11px] text-blue-600 underline dark:text-blue-400">
                          Open thread: {(decision.thread_title || decision.thread_id).slice(0, 80)}
                        </Link>
                      )}
                      {decision.supersedes_statement && (
                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Supersedes: {decision.supersedes_statement}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { void resolveItem({ kind: "decision", id: decision.id, status: "active" }); }}
                        className="rounded-md border border-emerald-300 px-2.5 py-1 text-[11px] font-medium text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { void resolveItem({ kind: "decision", id: decision.id, status: "rejected" }); }}
                        className="rounded-md border border-red-300 px-2.5 py-1 text-[11px] font-medium text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                  {decision.rationale && (
                    <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">Why: {decision.rationale}</p>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {memoryCandidates.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Memory candidates</h2>
              <span className="text-[11px] text-zinc-400">{memoryCandidates.length}</span>
            </div>
            {memoryCandidates.map((candidate) => {
              const busy = acting?.startsWith(`memory:${candidate.id}:`) || false;
              return (
                <div key={candidate.id} className="rounded-lg border border-sky-200 bg-white p-3 dark:border-sky-800 dark:bg-zinc-900">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{candidate.text}</p>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        #{candidate.channel_name || candidate.channel_id} · {candidate.category} · {candidate.confidence == null ? "?" : candidate.confidence.toFixed(2)} confidence
                      </p>
                      {candidate.thread_id && (
                        <Link href={`/channels/${candidate.channel_id}/${candidate.thread_id}`} className="mt-1 inline-block text-[11px] text-blue-600 underline dark:text-blue-400">
                          Open thread: {(candidate.thread_title || candidate.thread_id).slice(0, 80)}
                        </Link>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { void resolveItem({ kind: "memory", id: candidate.id, status: "accepted" }); }}
                        className="rounded-md border border-emerald-300 px-2.5 py-1 text-[11px] font-medium text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { void resolveItem({ kind: "memory", id: candidate.id, status: "rejected" }); }}
                        className="rounded-md border border-red-300 px-2.5 py-1 text-[11px] font-medium text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {proposals.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Proposals</h2>
              <span className="text-[11px] text-zinc-400">{proposals.length}</span>
            </div>
            {proposals.map((proposal) => {
              const busy = acting?.startsWith(`proposal:${proposal.id}:`) || false;
              const capabilityIds = parseJsonArray(proposal.capability_ids);
              const evidence = parseJsonArray(proposal.evidence);
              return (
                <div key={proposal.id} className="rounded-lg border border-fuchsia-200 bg-white p-3 dark:border-fuchsia-800 dark:bg-zinc-900">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{proposal.hypothesis}</p>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        #{proposal.channel_name || proposal.channel_id} · {relativeTime(proposal.created_at)} · {capabilityIds.length} capabilities · {evidence.length} evidence refs
                      </p>
                      {proposal.thread_id && (
                        <Link href={`/channels/${proposal.channel_id}/${proposal.thread_id}`} className="mt-1 inline-block text-[11px] text-blue-600 underline dark:text-blue-400">
                          Open thread: {(proposal.thread_title || proposal.thread_id).slice(0, 80)}
                        </Link>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { void resolveItem({ kind: "proposal", id: proposal.id, status: "accepted" }); }}
                        className="rounded-md border border-emerald-300 px-2.5 py-1 text-[11px] font-medium text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { void resolveItem({ kind: "proposal", id: proposal.id, status: "rejected" }); }}
                        className="rounded-md border border-red-300 px-2.5 py-1 text-[11px] font-medium text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Capabilities</p>
                      <pre className="overflow-x-auto rounded-md bg-zinc-50 p-2 text-[11px] text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">{prettyJson(proposal.capability_ids)}</pre>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Changes</p>
                      <pre className="overflow-x-auto rounded-md bg-zinc-50 p-2 text-[11px] text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">{prettyJson(proposal.changes)}</pre>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Evidence refs</p>
                    <pre className="overflow-x-auto rounded-md bg-zinc-50 p-2 text-[11px] text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">{prettyJson(proposal.evidence)}</pre>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
