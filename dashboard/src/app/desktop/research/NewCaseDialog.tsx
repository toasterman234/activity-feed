"use client";

import { useState } from "react";

const KIND_LABEL: Record<string, string> = {
  theme: "Theme / Sector",
  symbol_thesis: "Symbol Thesis",
  screen_rule: "Screen Rule",
  trade_doctrine: "Trade Doctrine",
};

const KIND_ORDER = ["theme", "symbol_thesis", "screen_rule", "trade_doctrine"] as const;

export function NewCaseDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("theme");
  const [symbols, setSymbols] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ threadUrl: string } | null>(null);

  if (!open) return null;

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/channels/create-research-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          kind,
          symbols: symbols
            .split(/[,\s]+/)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
          summary: summary.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to create thread");
      setResult({ threadUrl: body.threadUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setTitle("");
    setKind("theme");
    setSymbols("");
    setSummary("");
    setError(null);
    setResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/30">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {result ? "Case created" : "New Research Case"}
          </h2>
          <button
            onClick={() => { reset(); onClose(); }}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Success state */}
        {result ? (
          <div className="px-5 py-6 space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Thread created in the Quant Finance channel. It&apos;s in Frame stage — answer the
              framing questions there.
            </div>
            <div className="flex gap-3">
              <a
                href={result.threadUrl}
                className="flex-1 rounded-md bg-violet-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-violet-700 transition-colors"
              >
                Open thread
              </a>
              <button
                onClick={() => { reset(); onClose(); }}
                className="rounded-md border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* Form */
          <div className="px-5 py-4 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Title */}
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Case title
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. AI Power Infrastructure Scalability"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-300 focus:outline-none focus:ring-1 focus:ring-violet-200"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              />
            </label>

            {/* Kind */}
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Kind
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {KIND_ORDER.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                      kind === k
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </label>

            {/* Symbols */}
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Symbols · comma or space separated
              </span>
              <input
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                placeholder="NVDA, AVGO, MRVL"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-300 focus:outline-none focus:ring-1 focus:ring-violet-200"
              />
            </label>

            {/* Summary */}
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Summary · what to investigate
              </span>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="What catalyst, thesis, or question drives this case?"
                rows={3}
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-300 focus:outline-none focus:ring-1 focus:ring-violet-200 resize-none"
              />
            </label>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <p className="text-[11px] text-gray-400">
                Creates a thread in Quant Finance · Frame stage
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { reset(); onClose(); }}
                  className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={busy || !title.trim()}
                  className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {busy ? "Creating…" : "Create case"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
