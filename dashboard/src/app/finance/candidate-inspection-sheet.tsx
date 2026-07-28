"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getCandidateInspection,
  getFindings,
  type CandidateInspection,
  type ResearchFinding,
} from "../../lib/market-lake";
import {
  getFinanceResearch,
  researchThreadHref,
  type FinanceResearchContext,
} from "../../lib/finance-research";
import { writeChannelRow } from "../writeChannelRow";

export interface CandidateSummary {
  symbol: string;
  last: number | null;
  changePct: number | null;
  primaryLabel: string;
  primaryValue: string;
  reasons: string[];
  contradictions: string[];
  source: string;
  asOf: string | null;
}

const MODE_STRATEGY: Record<string, string> = {
  live: "wheel,option-signal-equity",
  vrp: "wheel,option-signal-equity",
  fundamental: "wheel",
  momentum: "momentum-rotation",
  dividend: "income-etf",
  composite: "wheel,option-signal-equity,momentum-rotation",
  ta: "wheel,option-signal-equity",
};

function fmtMoney(value: number | null | undefined): string {
  return value == null ? "—" : `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtPct(value: number | null | undefined): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-400">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-100">{value}</p>
      {note && <p className="mt-1 text-[10px] text-zinc-400">{note}</p>}
    </div>
  );
}

function unavailableText(data: CandidateInspection | null, label: string): string {
  return data?.unavailable.includes(label) ? "Source temporarily unavailable" : "No coverage";
}

export default function CandidateInspectionSheet({
  candidate,
  mode,
  open,
  shortlisted,
  onToggleShortlist,
  onCompare,
  onCreateTrade,
  onOpenChain,
  onClose,
}: {
  candidate: CandidateSummary | null;
  mode: string;
  open: boolean;
  shortlisted: boolean;
  onToggleShortlist: () => void;
  onCompare: () => void;
  onCreateTrade: () => void;
  onOpenChain: () => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<CandidateInspection | null>(null);
  const [findings, setFindings] = useState<ResearchFinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [channelResearch, setChannelResearch] = useState<FinanceResearchContext[]>([]);
  const [requestState, setRequestState] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !candidate) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    setFindings([]);
    void getCandidateInspection(candidate.symbol).then((inspection) => {
      if (cancelled) return;
      setData(inspection);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    void getFindings(MODE_STRATEGY[mode] ?? "").then((research) => {
      if (cancelled) return;
      setFindings(
        research
          .filter((item) => ["negative", "killed", "confirmed"].includes(item.verdict))
          .slice(0, 4),
      );
    }).catch(() => {});
    void getFinanceResearch([candidate.symbol]).then((snapshot) => {
      if (!cancelled) setChannelResearch(snapshot.contexts);
    }).catch(() => {
      if (!cancelled) setChannelResearch([]);
    });
    return () => {
      cancelled = true;
    };
  }, [candidate, mode, open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose, open]);

  const priceContext = useMemo(() => {
    const closes = data?.prices.map((bar) => bar.close).filter((value): value is number => value != null) ?? [];
    if (closes.length < 2) return null;
    const latest = closes.at(-1) ?? 0;
    const monthAgo = closes[Math.max(0, closes.length - 22)];
    const high = Math.max(...closes);
    return {
      return1m: monthAgo ? latest / monthAgo - 1 : null,
      drawdown: high ? latest / high - 1 : null,
    };
  }, [data]);

  if (!open || !candidate) return null;
  const fundamental = data?.fundamentals;
  const vrp = data?.vrp;
  const dividend = data?.dividends;

  const requestResearch = async () => {
    if (!window.confirm(`Create a Quant research task for ${candidate.symbol}?`)) return;
    setRequestState("Creating…");
    try {
      const id = crypto.randomUUID();
      await writeChannelRow("messages", {
        id,
        channel_id: "08bf3d95-a069-4693-937d-553b49c86c77",
        thread_id: null,
        author: "ben",
        body: [
          `Finance research request — ${candidate.symbol}`,
          "",
          `Origin: ${mode} screener`,
          `Matched: ${candidate.reasons.join("; ")}`,
          `Contradictions: ${candidate.contradictions.join("; ")}`,
          `Data as of: ${candidate.asOf ?? "mixed timestamps"}`,
          "",
          "Question: Is this candidate actionable, what would invalidate it, and what trade structure/risk limits fit the evidence?",
        ].join("\n"),
        created_at: new Date().toISOString(),
      });
      setRequestState("Quant task created");
      window.location.href = `/channels/08bf3d95-a069-4693-937d-553b49c86c77/${id}`;
    } catch {
      setRequestState("Could not create Quant task");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45" role="dialog" aria-modal="true" aria-label={`${candidate.symbol} candidate inspection`}>
      <button className="min-w-0 flex-1 cursor-default" aria-label="Close candidate inspection" onClick={onClose} />
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{candidate.symbol}</h2>
                <span className="font-mono text-sm text-zinc-500">{fmtMoney(candidate.last)}</span>
                {candidate.changePct != null && (
                  <span className={`font-mono text-xs ${candidate.changePct >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtPct(candidate.changePct)}</span>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-400">{candidate.source} · {candidate.asOf ? `as of ${candidate.asOf.slice(0, 10)}` : "mixed timestamps"}</p>
            </div>
            <button onClick={onClose} className="rounded-md px-2 py-1 text-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900" aria-label="Close">×</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={onToggleShortlist} className={`rounded-md px-3 py-2 text-xs font-semibold ${shortlisted ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>
              {shortlisted ? "★ In shortlist" : "☆ Add to shortlist"}
            </button>
            <button onClick={onCompare} className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">Compare</button>
            <button onClick={onCreateTrade} className="rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-zinc-950">Create trade</button>
            <button onClick={onOpenChain} className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">Open live chain</button>
            <button onClick={() => { void requestResearch(); }} className="rounded-md border border-violet-300 px-3 py-2 text-xs font-semibold text-violet-700 dark:border-violet-800 dark:text-violet-300">Research this candidate</button>
            {requestState && <span className="self-center text-[11px] text-zinc-400">{requestState}</span>}
          </div>
        </header>

        <div className="space-y-5 p-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/25">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Why it matched</h3>
              <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-200">
                {candidate.reasons.map((reason) => <li key={reason}>✓ {reason}</li>)}
              </ul>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/25">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">Why it may be wrong</h3>
              <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-200">
                {candidate.contradictions.map((risk) => <li key={risk}>! {risk}</li>)}
              </ul>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Candidate snapshot</h3>
              {loading && <span className="text-[11px] text-zinc-400">Loading enrichment…</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label={candidate.primaryLabel} value={candidate.primaryValue} note="Originating screen" />
              <Metric label="1M return" value={fmtPct(priceContext?.return1m)} note={unavailableText(data, "price history")} />
              <Metric label="90D drawdown" value={fmtPct(priceContext?.drawdown)} />
              <Metric label="IV rank" value={fmtPct(vrp?.ivr_252d ?? fundamental?.ivr_252d)} note={data?.vrpMeta?.as_of ?? data?.fundamentalsMeta?.as_of} />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Fundamentals · assignment lens</h3>
              {fundamental ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div><dt className="text-zinc-400">Quality tier</dt><dd className="mt-1 font-semibold">{fundamental.fundamental_tier ?? "—"}</dd></div>
                  <div><dt className="text-zinc-400">Piotroski</dt><dd className="mt-1 font-mono">{fundamental.piotroski_score ?? "—"} / 9</dd></div>
                  <div><dt className="text-zinc-400">Debt / equity</dt><dd className="mt-1 font-mono">{fundamental.debt_to_equity?.toFixed(2) ?? "—"}</dd></div>
                  <div><dt className="text-zinc-400">FCF margin</dt><dd className="mt-1 font-mono">{fmtPct(fundamental.fcf_margin)}</dd></div>
                  <div><dt className="text-zinc-400">ROE</dt><dd className="mt-1 font-mono">{fmtPct(fundamental.roe)}</dd></div>
                  <div><dt className="text-zinc-400">Revenue growth</dt><dd className="mt-1 font-mono">{fmtPct(fundamental.revenue_growth_yoy)}</dd></div>
                </dl>
              ) : <p className="mt-3 text-xs text-zinc-400">{unavailableText(data, "fundamentals")}</p>}
            </div>
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Volatility & income</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div><dt className="text-zinc-400">VRP 30D</dt><dd className="mt-1 font-mono">{fmtPct(vrp?.vrp_30d ?? fundamental?.vrp_30d)}</dd></div>
                <div><dt className="text-zinc-400">IV / HV</dt><dd className="mt-1 font-mono">{fmtPct(vrp?.iv_30d)} / {fmtPct(vrp?.hv30)}</dd></div>
                <div><dt className="text-zinc-400">Put skew</dt><dd className="mt-1 font-mono">{fmtPct(vrp?.put_skew_25d)}</dd></div>
                <div><dt className="text-zinc-400">P/C volume</dt><dd className="mt-1 font-mono">{vrp?.pc_volume_ratio?.toFixed(2) ?? "—"}</dd></div>
                <div><dt className="text-zinc-400">Dividend yield</dt><dd className="mt-1 font-mono">{fmtPct(dividend?.trailing_12m_regular_yield)}</dd></div>
                <div><dt className="text-zinc-400">Latest ex-date</dt><dd className="mt-1 font-mono">{dividend?.latest_ex_date ?? "—"}</dd></div>
              </dl>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Portfolio relationship</h3>
            {data?.positions.length ? (
              <div className="mt-3 space-y-2">
                {data.positions.map((position) => (
                  <div key={`${position.account}-${position.symbol}`} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900">
                    <span><strong>{position.account}</strong> · {position.units.toLocaleString()} units</span>
                    <span className="font-mono">{fmtMoney(position.market_value)} · P/L {fmtMoney(position.open_pnl)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-xs text-zinc-400">No matching Schwab or Fidelity position found.</p>}
          </section>

          <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Quant channel context</h3>
              <span className="text-[10px] uppercase tracking-wide text-violet-600">Provenance-linked</span>
            </div>
            {channelResearch.length ? (
              <div className="mt-3 space-y-3">
                {channelResearch.map((context) => (
                  <article key={context.id} className="rounded-lg border border-violet-200 bg-white p-3 dark:border-violet-900 dark:bg-zinc-950">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold">{context.title}</span>
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-violet-700 dark:bg-violet-950 dark:text-violet-300">{context.status}</span>
                      {context.verdict && <span className="text-[10px] text-zinc-400">{context.verdict}</span>}
                    </div>
                    <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-zinc-500">{context.summary}</p>
                    {context.blockingGaps.length > 0 && <p className="mt-2 text-[10px] text-amber-600">{context.blockingGaps.length} open evidence gap{context.blockingGaps.length === 1 ? "" : "s"}</p>}
                    {(context.graphContext?.activeDecisions.length ?? 0) > 0 && (
                      <div className="mt-2 rounded-md bg-emerald-50 px-2.5 py-2 dark:bg-emerald-950/30">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Active continuity decision</p>
                        {context.graphContext?.activeDecisions.slice(0, 2).map((decision) => (
                          <p key={decision.id} className="mt-1 text-[10px] text-zinc-600 dark:text-zinc-300">{decision.statement}</p>
                        ))}
                      </div>
                    )}
                    {(context.graphContext?.acceptedMemory.length ?? 0) > 0 && (
                      <div className="mt-2">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Accepted continuity memory</p>
                        {context.graphContext?.acceptedMemory.slice(0, 2).map((memory) => (
                          <p key={memory.id} className="mt-1 text-[10px] text-zinc-500">• {memory.text}</p>
                        ))}
                      </div>
                    )}
                    <a href={researchThreadHref(context)} className="mt-2 inline-block text-[11px] font-semibold text-violet-700 underline underline-offset-2 dark:text-violet-300">Open Quant task</a>
                  </article>
                ))}
              </div>
            ) : <p className="mt-3 text-xs text-zinc-400">No linked Quant context for this symbol yet.</p>}
          </section>

          <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Research evidence</h3>
              <span className="text-[10px] uppercase tracking-wide text-zinc-400">Not a recommendation</span>
            </div>
            {findings.length ? (
              <div className="mt-3 space-y-3">
                {findings.map((finding) => (
                  <article key={finding.finding_key} className="border-l-2 border-zinc-300 pl-3 dark:border-zinc-700">
                    <div className="flex gap-2 text-[10px] font-semibold uppercase tracking-wide">
                      <span className={finding.verdict === "confirmed" ? "text-emerald-600" : "text-amber-600"}>{finding.verdict}</span>
                      <span className="text-zinc-400">{finding.evidence ?? finding.strategy}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">{finding.title}</p>
                    {finding.key_metric && <p className="mt-1 text-[11px] text-zinc-400">{finding.key_metric}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                Research source is unavailable. Keep the standing caveat: a high scan score is not a trade recommendation, and high option-selling win rates can still hide negative expected value.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
            <h3 className="text-xs font-semibold uppercase tracking-[0.13em] text-zinc-500">Event coverage</h3>
            <p className="mt-2 text-xs text-zinc-400">Next earnings: unknown — no live earnings-serving contract is currently available. Unknown does not mean event-free.</p>
          </section>
        </div>
      </aside>
    </div>
  );
}
