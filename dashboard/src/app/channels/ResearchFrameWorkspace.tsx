"use client";

import { useMemo, useState } from "react";
import type {
  ContextCandidateRow,
  ContextScanRow,
  StageInteractionRow,
} from "./shapes";

type Frame = {
  primaryQuestion: string;
  decision: string;
  scope: string[];
  subquestions: string[];
  successCriteria: string[];
};

export function ResearchFrameWorkspace({
  threadId,
  channelId,
  stageId,
  frameEndpoint = "/api/channels/frame",
  contextEndpoint = "/api/channels/context-scan",
  interactions,
  scans,
  candidates,
  onRefresh,
}: {
  threadId: string;
  channelId: string;
  stageId: string;
  frameEndpoint?: string;
  contextEndpoint?: string;
  interactions: StageInteractionRow[];
  scans: ContextScanRow[];
  candidates: ContextCandidateRow[];
  onRefresh: () => Promise<void>;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<"frame" | "approve" | "scan" | "continue" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const frameInteractions = interactions.filter((item) => item.stage_id === stageId);
  const latestAgent = [...frameInteractions].reverse().find((item) => item.role === "agent");
  const approved = frameInteractions.some((item) => item.kind === "frame.approval" && item.status === "approved");
  const proposal = useMemo(() => {
    const row = [...frameInteractions].reverse().find((item) => item.kind === "frame.proposal");
    if (!row) return null;
    try {
      return (JSON.parse(row.payload) as { frame?: Frame }).frame || null;
    } catch {
      return null;
    }
  }, [frameInteractions]);
  const latestScan = scans[0] || null;
  const latestCandidates = latestScan
    ? candidates.filter((candidate) => candidate.scan_id === latestScan.id)
    : [];

  const post = async (url: string, payload: Record<string, unknown>, state: typeof busy) => {
    setBusy(state);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, channelId, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setAnswer("");
      await onRefresh();
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const submitAnswer = () => {
    if (!answer.trim()) return;
    void post(frameEndpoint, { action: "respond", answer: answer.trim() }, "frame");
  };

  const reviewCandidate = async (candidate: ContextCandidateRow, status: "included" | "ignored") => {
    await post(contextEndpoint, {
      action: "review",
      candidateId: candidate.id,
      status,
    }, null);
  };

  return (
    <section className="rounded-xl border border-zinc-300 bg-card p-3 shadow-[0_10px_30px_rgba(24,24,27,0.05)] dark:border-zinc-700 dark:bg-zinc-900">
      {!approved ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">Frame workspace</p>
              <h3 className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {latestAgent?.kind === "frame.question"
                  ? "One thing before I frame this"
                  : proposal
                    ? "Proposed research frame"
                    : "What do you want to research?"}
              </h3>
            </div>
            <span className="rounded-full bg-zinc-100 px-2 py-1 font-mono text-[9px] text-zinc-500 dark:bg-zinc-800">
              one question at a time
            </span>
          </div>

          {latestAgent?.kind === "frame.question" && (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950">
              <p className="text-sm leading-relaxed text-sky-950 dark:text-sky-100">{latestAgent.content}</p>
              {(() => {
                try {
                  const reason = (JSON.parse(latestAgent.payload) as { reason?: string }).reason;
                  return reason ? <p className="mt-1 text-[10px] text-sky-700 dark:text-sky-300">{reason}</p> : null;
                } catch {
                  return null;
                }
              })()}
            </div>
          )}

          {proposal && (
            <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_1fr]">
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="font-mono text-[9px] uppercase text-zinc-400">Primary question</p>
                <p className="mt-1 text-sm font-medium leading-relaxed text-zinc-900 dark:text-zinc-100">{proposal.primaryQuestion}</p>
                <p className="mt-2 font-mono text-[9px] uppercase text-zinc-400">Decision supported</p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{proposal.decision}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="font-mono text-[9px] uppercase text-zinc-400">Research branches</p>
                <ul className="mt-1 space-y-1">
                  {proposal.subquestions.map((item) => (
                    <li key={item} className="flex gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                      <span className="text-zinc-300">•</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {(!proposal || answer.length > 0) && (
            <div className="mt-3 flex gap-2">
              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitAnswer();
                  }
                }}
                rows={2}
                placeholder={latestAgent?.kind === "frame.question"
                  ? "Answer here…"
                  : proposal
                    ? "Tell the agent what to change…"
                    : "Enter a research question…"}
                className="min-w-0 flex-1 resize-none rounded-lg border border-zinc-300 bg-card px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-sky-950"
                disabled={busy !== null}
              />
              <button
                type="button"
                onClick={submitAnswer}
                disabled={!answer.trim() || busy !== null}
                className="self-stretch rounded-lg bg-zinc-950 px-4 text-xs font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-950"
              >
                {busy === "frame" ? "Thinking…" : "Send"}
              </button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {proposal && (
              <>
                <button
                  type="button"
                  onClick={() => { void post(frameEndpoint, { action: "approve" }, "approve"); }}
                  disabled={busy !== null}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {busy === "approve" ? "Approving…" : "Approve frame →"}
                </button>
                <button
                  type="button"
                  onClick={() => setAnswer("Change the frame so that ")}
                  disabled={busy !== null}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Change something
                </button>
              </>
            )}
            {!proposal && (
              <button
                type="button"
                onClick={() => { void post(frameEndpoint, { action: "assume" }, "frame"); }}
                disabled={busy !== null}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                Use reasonable assumptions
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Frame approved</p>
              <h3 className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Check your personal context</h3>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
                Search related vault notes, accepted memories, previous threads, Agent Brain, and Life OS. Nothing is admitted into the research until you include it.
              </p>
            </div>
            {latestScan && (
              <span className="rounded-full bg-zinc-100 px-2 py-1 font-mono text-[9px] uppercase text-zinc-500 dark:bg-zinc-800">
                {latestScan.status}
              </span>
            )}
          </div>

          {!latestScan && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { void post(contextEndpoint, { action: "scan" }, "scan"); }}
                disabled={busy !== null}
                className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-950"
              >
                {busy === "scan" ? "Searching your context…" : "Scan personal context"}
              </button>
              <button
                type="button"
                onClick={() => { void post(contextEndpoint, { action: "continue" }, "continue"); }}
                disabled={busy !== null}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-700"
              >
                Skip and start gathering
              </button>
            </div>
          )}

          {latestScan && (
            <>
              <div className="mt-3 space-y-2">
                {latestCandidates.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-xs text-zinc-400 dark:border-zinc-700">
                    No related personal context was found. You can continue without it.
                  </p>
                ) : latestCandidates.map((candidate) => (
                  <article key={candidate.id} className={`rounded-lg border p-3 ${
                    candidate.status === "included"
                      ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/40"
                      : candidate.status === "ignored"
                        ? "border-zinc-200 opacity-55 dark:border-zinc-800"
                        : "border-zinc-200 dark:border-zinc-800"
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-500 dark:bg-zinc-800">{candidate.source}</span>
                          <span className="truncate font-mono text-[9px] text-zinc-400">{candidate.source_ref}</span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">{candidate.excerpt}</p>
                        <p className="mt-1 text-[10px] text-zinc-400">{candidate.relevance}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => { void reviewCandidate(candidate, "included"); }}
                          className={`rounded px-2 py-1 text-[10px] font-medium ${candidate.status === "included" ? "bg-emerald-600 text-white" : "border border-zinc-300 text-zinc-500 dark:border-zinc-700"}`}
                        >
                          Include
                        </button>
                        <button
                          type="button"
                          onClick={() => { void reviewCandidate(candidate, "ignored"); }}
                          className={`rounded px-2 py-1 text-[10px] font-medium ${candidate.status === "ignored" ? "bg-zinc-500 text-white" : "border border-zinc-300 text-zinc-500 dark:border-zinc-700"}`}
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { void post(contextEndpoint, { action: "continue" }, "continue"); }}
                disabled={busy !== null}
                className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {busy === "continue" ? "Starting Gather…" : `Use selected context and start gathering →`}
              </button>
            </>
          )}
        </>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
    </section>
  );
}
