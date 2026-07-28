"use client";

import { useState } from "react";

export type MoveChannelOption = { id: string; name: string };

export function MoveThreadDialog({
  open,
  onClose,
  threadId,
  fromChannelId,
  channels,
  onMoved,
}: {
  open: boolean;
  onClose: () => void;
  threadId: string;
  fromChannelId: string;
  channels: MoveChannelOption[];
  onMoved: (toChannelId: string) => void;
}) {
  const destinations = channels.filter((c) => c.id !== fromChannelId);
  const [toChannelId, setToChannelId] = useState(destinations[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const move = async () => {
    if (!toChannelId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/channels/move-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          fromChannelId,
          toChannelId,
          actor: "you",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`);
        return;
      }
      onMoved(toChannelId);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-thread-title"
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2 id="move-thread-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Move to channel
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Plans, artifacts, and history move with the thread. Lifecycle and state stay the same.
        </p>

        {destinations.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-400">No other channels to move to.</p>
        ) : (
          <label className="mt-3 block">
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Destination</span>
            <select
              value={toChannelId}
              onChange={(e) => setToChannelId(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {destinations.map((c) => (
                <option key={c.id} value={c.id}>
                  # {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && (
          <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !toChannelId || destinations.length === 0}
            onClick={() => { void move(); }}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy ? "Moving…" : "Move"}
          </button>
        </div>
      </div>
    </div>
  );
}
