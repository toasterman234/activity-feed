"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getFinanceResearch,
  refreshFinanceSnapshot,
  researchThreadHref,
  type FinanceResearchContext,
  type FinanceResearchStatus,
} from "../../../lib/finance-research";
import ResearchMap from "./map-view";
import { NewCaseDialog } from "./NewCaseDialog";

const KIND_LABEL: Record<FinanceResearchContext["kind"], string> = {
  theme: "Theme",
  symbol_thesis: "Symbol thesis",
  screen_rule: "Screener rule",
  trade_doctrine: "Trade doctrine",
};

const KIND_ORDER: FinanceResearchContext["kind"][] = [
  "theme",
  "screen_rule",
  "trade_doctrine",
  "symbol_thesis",
];

const STATUS_COLOR: Record<FinanceResearchStatus, string> = {
  working: "bg-violet-100 text-violet-700 border-violet-300",
  provisional: "bg-amber-100 text-amber-700 border-amber-300",
  published: "bg-emerald-100 text-emerald-700 border-emerald-300",
  stale: "bg-gray-100 text-gray-500 border-gray-300",
};

const STATUS_LABEL: Record<FinanceResearchStatus, string> = {
  working: "Working",
  provisional: "Provisional",
  published: "Published",
  stale: "Stale",
};

const KIND_COLOR: Record<FinanceResearchContext["kind"], string> = {
  theme: "bg-violet-600 text-white",
  screen_rule: "bg-cyan-600 text-white",
  trade_doctrine: "bg-amber-600 text-white",
  symbol_thesis: "bg-emerald-600 text-white",
};

function SymbolBadge({ symbol }: { symbol: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-mono font-medium text-gray-700">
      {symbol}
    </span>
  );
}

function ResearchDetailSheet({
  context,
  open,
  onClose,
}: {
  context: FinanceResearchContext | null;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open, onClose]);

  if (!open || !context) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={`${context.title} detail`}
    >
      <button
        className="min-w-0 flex-1 cursor-default"
        aria-label="Close research detail"
        onClick={onClose}
      />
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-gray-200 bg-white shadow-2xl">
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-6 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    KIND_COLOR[context.kind]
                  }`}
                >
                  {KIND_LABEL[context.kind]}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    STATUS_COLOR[context.status]
                  }`}
                >
                  {STATUS_LABEL[context.status]}
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-gray-900">
                {context.title}
              </h2>
              <p className="mt-1 text-xs text-gray-400">
                {context.source.objectType === "mira_case"
                  ? "Mira research pipeline"
                  : context.source.objectType}{" "}
                · {context.graphContext?.activeDecisions.length ?? 0} decisions ·{" "}
                {context.graphContext?.acceptedMemory.length ?? 0} memory items
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md px-2 py-1 text-lg text-gray-400 hover:bg-gray-100"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {context.source.threadId ? (
              <a
                href={researchThreadHref(context)}
                className="rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in Channels
              </a>
            ) : (
              <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400">
                No channel thread
              </span>
            )}
            {context.staleAfter && (
              <span className="self-center text-[11px] text-gray-400">
                Stale after{" "}
                {new Date(context.staleAfter).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Verdict */}
          {context.verdict && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 mb-2">
                Verdict
              </h3>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 font-mono">
                {context.verdict === "working_view"
                  ? "Working view — active research, conclusions are provisional"
                  : context.verdict}
              </p>
            </section>
          )}

          {/* Summary */}
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 mb-2">
              Summary
            </h3>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {context.summary}
            </div>
          </section>

          {/* Collection / Symbols */}
          {context.collection && context.collection.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 mb-2">
                Research collection · {context.collection.length} symbols
              </h3>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                      <th className="px-4 py-2 font-medium text-[11px]">Symbol</th>
                      <th className="px-4 py-2 font-medium text-[11px]">Role</th>
                      <th className="px-4 py-2 font-medium text-[11px]">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {context.collection.map((item) => (
                      <tr
                        key={item.symbol}
                        className="border-b border-gray-50 last:border-0"
                      >
                        <td className="px-4 py-2 font-mono font-semibold text-gray-800">
                          <a
                            href={`/desktop/watchlist?symbol=${item.symbol}`}
                            className="hover:text-violet-600"
                          >
                            {item.symbol}
                          </a>
                        </td>
                        <td className="px-4 py-2 text-gray-600">{item.role}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs">
                          {item.notes.length > 120
                            ? item.notes.slice(0, 120) + "…"
                            : item.notes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Just symbols (no collection details) */}
          {(!context.collection || context.collection.length === 0) &&
            context.symbols.length > 0 && (
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 mb-2">
                  Symbols · {context.symbols.length}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {context.symbols.map((symbol) => (
                    <SymbolBadge key={symbol} symbol={symbol} />
                  ))}
                </div>
              </section>
            )}

          {/* Blocking gaps */}
          {context.blockingGaps.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-600 mb-2">
                Blocking gaps · {context.blockingGaps.length}
              </h3>
              <ul className="space-y-1.5">
                {context.blockingGaps.map((gap, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-sm text-amber-800"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Graph decisions */}
          {context.graphContext?.activeDecisions &&
            context.graphContext.activeDecisions.length > 0 && (
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 mb-2">
                  Active decisions ·{" "}
                  {context.graphContext.activeDecisions.length}
                </h3>
                <div className="space-y-2">
                  {context.graphContext.activeDecisions.map((decision) => (
                    <div
                      key={decision.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                    >
                      <p className="text-sm font-medium text-gray-800">
                        {decision.statement}
                      </p>
                      {decision.rationale && (
                        <p className="mt-1 text-xs text-gray-500">
                          {decision.rationale}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

          {/* Memory items */}
          {context.graphContext?.acceptedMemory &&
            context.graphContext.acceptedMemory.length > 0 && (
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 mb-2">
                  Memory · {context.graphContext.acceptedMemory.length} items
                </h3>
                <div className="space-y-1.5">
                  {context.graphContext.acceptedMemory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-2 rounded border border-gray-100 bg-gray-50/50 p-2.5"
                    >
                      <span className="mt-0.5 shrink-0 rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold text-purple-600 uppercase">
                        {item.category}
                      </span>
                      <p className="text-xs text-gray-600">{item.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
        </div>
      </aside>
    </div>
  );
}

export default function DesktopResearchPage() {
  const [contexts, setContexts] = useState<FinanceResearchContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<
    FinanceResearchContext["kind"] | "all"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    FinanceResearchStatus | "all"
  >("all");
  const [selectedContext, setSelectedContext] =
    useState<FinanceResearchContext | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "map">("cards");
  const [refreshing, setRefreshing] = useState(false);
  const [showNewCase, setShowNewCase] = useState(false);

  const loadResearch = () => {
    setLoading(true);
    void getFinanceResearch()
      .then((snapshot) => {
        setContexts(snapshot.contexts);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load research");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadResearch(); }, []);

  const filtered = useMemo(() => {
    return contexts
      .filter((context) =>
        kindFilter === "all" ? true : context.kind === kindFilter,
      )
      .filter((context) =>
        statusFilter === "all" ? true : context.status === statusFilter,
      )
      .sort((a, b) => {
        const kindDiff = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
        if (kindDiff !== 0) return kindDiff;
        return a.title.localeCompare(b.title);
      });
  }, [contexts, kindFilter, statusFilter]);

  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = { all: contexts.length };
    for (const context of contexts) {
      counts[context.kind] = (counts[context.kind] || 0) + 1;
    }
    return counts;
  }, [contexts]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: contexts.length };
    for (const context of contexts) {
      counts[context.status] = (counts[context.status] || 0) + 1;
    }
    return counts;
  }, [contexts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Research
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading
              ? "Loading…"
              : `${contexts.length} research contexts from Mira pipeline & Channels`}
          </p>
        </div>
  <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNewCase(true)}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 transition-colors"
          >
            + New Case
          </button>

          <span className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-violet-500" />
            Live
          </span>

          {/* View toggle */}
          <div className="flex rounded-md border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode("cards")}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "cards"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "map"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              Map
            </button>
          </div>

          <button
            onClick={() => {
              setRefreshing(true);
              void refreshFinanceSnapshot()
                .then(() => loadResearch())
                .catch((err) => {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Failed to refresh from Mira",
                  );
                })
                .finally(() => setRefreshing(false));
            }}
            disabled={refreshing}
            className="rounded-md border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh from Mira"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
          Kind
        </span>
        {(["all", ...KIND_ORDER] as const).map((kind) => (
          <button
            key={kind}
            onClick={() =>
              setKindFilter(kind as FinanceResearchContext["kind"] | "all")
            }
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              kindFilter === kind
                ? kind === "all"
                  ? "bg-gray-900 text-white"
                  : KIND_COLOR[kind]
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {kind === "all" ? "All" : KIND_LABEL[kind]}{" "}
            <span className="opacity-70">{kindCounts[kind] ?? 0}</span>
          </button>
        ))}

        <span className="ml-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
          Status
        </span>
        {(
          [
            "all",
            "working",
            "provisional",
            "published",
            "stale",
          ] as const
        ).map((status) => (
          <button
            key={status}
            onClick={() =>
              setStatusFilter(status as FinanceResearchStatus | "all")
            }
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === status
                ? status === "all"
                  ? "bg-gray-900 text-white border-gray-900"
                  : STATUS_COLOR[status]
                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {status === "all" ? "All" : STATUS_LABEL[status]}{" "}
            <span className="opacity-70">{statusCounts[status] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Content: cards or map */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-gray-400">Loading research…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-gray-400">
            No research contexts match the current filters.
          </p>
        </div>
      ) : viewMode === "map" ? (
        <ResearchMap
          contexts={filtered}
          onSelectContext={setSelectedContext}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((context) => (
            <button
              key={context.id}
              onClick={() => setSelectedContext(context)}
              className="rounded-xl border border-gray-200 bg-white p-5 text-left transition-shadow hover:shadow-md hover:border-gray-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                        KIND_COLOR[context.kind]
                      }`}
                    >
                      {KIND_LABEL[context.kind]}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                        STATUS_COLOR[context.status]
                      }`}
                    >
                      {STATUS_LABEL[context.status]}
                    </span>
                    {context.source.objectType === "mira_case" && (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-medium text-violet-600 border border-violet-200">
                        Mira
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 truncate">
                    {context.title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                    {context.summary}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {context.symbols.length > 0 && (
                    <p className="text-lg font-bold text-gray-800 tabular-nums">
                      {context.symbols.length}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400">symbols</p>
                </div>
              </div>

              {/* Mini symbol list */}
              {context.symbols.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {context.symbols.slice(0, 6).map((symbol) => (
                    <SymbolBadge key={symbol} symbol={symbol} />
                  ))}
                  {context.symbols.length > 6 && (
                    <span className="text-[11px] text-gray-400 self-center">
                      +{context.symbols.length - 6} more
                    </span>
                  )}
                </div>
              )}

              {/* Footer stats */}
              <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-400 border-t border-gray-100 pt-3">
                {context.blockingGaps.length > 0 && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {context.blockingGaps.length} gap
                    {context.blockingGaps.length !== 1 ? "s" : ""}
                  </span>
                )}
                {context.graphContext?.activeDecisions.length ? (
                  <span>
                    {context.graphContext.activeDecisions.length} decision
                    {context.graphContext.activeDecisions.length !== 1
                      ? "s"
                      : ""}
                  </span>
                ) : null}
                {context.staleAfter && (
                  <span>
                    Stale{" "}
                    {new Date(context.staleAfter).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <ResearchDetailSheet
        context={selectedContext}
        open={selectedContext !== null}
        onClose={() => setSelectedContext(null)}
      />

      <NewCaseDialog
        open={showNewCase}
        onClose={() => setShowNewCase(false)}
      />
    </div>
  );
}
