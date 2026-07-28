"use client";

import { useState } from "react";
import {
  FINANCE_PUBLICATION_KINDS,
  canPublishKind,
  type FinancePublicationKind,
} from "@/lib/finance-publication";

const LABELS: Record<FinancePublicationKind, string> = {
  watchlist_collection: "Watchlist collection",
  symbol_thesis: "Symbol thesis",
  screen_rule: "Screener rule",
  trade_doctrine: "Trade Lab doctrine",
};

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function FinancePublisherPanel({
  threadId,
  currentState,
}: {
  threadId: string;
  currentState: string;
}) {
  const [kind, setKind] = useState<FinancePublicationKind>("watchlist_collection");
  const [title, setTitle] = useState("");
  const [symbols, setSymbols] = useState("");
  const [summary, setSummary] = useState("");
  const [gaps, setGaps] = useState("");
  const [staleAfter, setStaleAfter] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const eligible = canPublishKind(kind, currentState);
  const publicationKey = `${threadId}:${kind}`;

  const submit = async (action: "publish" | "revoke") => {
    if (action === "publish" && !window.confirm(`Publish “${title}” to Finance?`)) return;
    if (action === "revoke" && !window.confirm(`Revoke this ${LABELS[kind].toLowerCase()} from Finance?`)) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/finance/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          threadId,
          publicationKey,
          kind,
          title,
          symbols,
          summary,
          blockingGaps: lines(gaps),
          staleAfter: staleAfter || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
      setResult(`${action === "publish" ? "Published" : "Revoked"} · v${body.version}`);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Publication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900 dark:bg-violet-950/20">
      <summary className="cursor-pointer text-xs font-semibold text-violet-700 dark:text-violet-300">
        Publish to Finance
        <span className="ml-2 text-[10px] font-normal text-zinc-400">explicit · versioned · reversible</span>
      </summary>
      <div className="mt-3 grid gap-2 border-t border-violet-100 pt-3 dark:border-violet-900/60 sm:grid-cols-2">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Artifact type
          <select value={kind} onChange={(event) => setKind(event.target.value as FinancePublicationKind)} className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-2 text-xs normal-case text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            {FINANCE_PUBLICATION_KINDS.map((value) => <option key={value} value={value}>{LABELS[value]}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-2 text-xs normal-case text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Symbols
          <input value={symbols} onChange={(event) => setSymbols(event.target.value)} placeholder="MU, WDC, NTAP" className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-2 text-xs normal-case text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Stale after
          <input type="date" value={staleAfter} onChange={(event) => setStaleAfter(event.target.value)} className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-2 text-xs normal-case text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 sm:col-span-2">
          Finance summary
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-2 text-xs normal-case text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 sm:col-span-2">
          Blocking gaps · one per line
          <textarea value={gaps} onChange={(event) => setGaps(event.target.value)} rows={2} className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-2 text-xs normal-case text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="button" disabled={busy || !eligible || !title.trim() || !summary.trim()} onClick={() => { void submit("publish"); }} className="rounded bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? "Working…" : "Publish version"}
          </button>
          <button type="button" disabled={busy} onClick={() => { void submit("revoke"); }} className="rounded border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-40 dark:border-red-900 dark:text-red-400">
            Revoke latest
          </button>
          {!eligible && <span className="text-[10px] text-amber-600">Accepted research is required for screen rules and trade doctrine.</span>}
          {result && <span className="text-[11px] text-zinc-500">{result}</span>}
        </div>
      </div>
    </details>
  );
}
