"use client";

import { useState } from "react";

interface ReviewEntryPanelProps {
  threadId: string;
  channelId: string;
  currentState: string;
  onRefresh: () => Promise<void>;
}

export function ReviewEntryPanel({
  threadId,
  channelId,
  currentState,
  onRefresh,
}: ReviewEntryPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startShipReview = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/channels/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, channelId, toState: "verified" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Transition failed (${res.status})`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-purple-200 bg-white p-3 shadow-[0_10px_30px_rgba(24,24,27,0.05)] dark:border-purple-800 dark:bg-zinc-900">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-purple-600 dark:text-purple-400">
        Coding · review entry
      </p>
      <h3 className="mt-1 text-base font-semibold">Ready for ship review</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        The implementation is complete and verified. Start the ship review to do a final check before accepting the change.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { void startShipReview(); }}
          disabled={busy}
          className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-40"
        >
          {busy ? "Starting…" : "Start ship review →"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        This moves the thread to Ready to ship, where you can run the guided review workspace.
      </p>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
