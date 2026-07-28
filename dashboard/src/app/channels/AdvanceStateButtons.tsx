"use client";

import { useState } from "react";
import { LIFECYCLES } from "./lifecycles";

const CONFIRM_KINDS = new Set(["done", "dead", "proven"]);

export function AdvanceStateButtons({
  lifecycleKey,
  currentState,
  channelId,
  threadId,
  disabled,
  onDone,
}: {
  lifecycleKey: string;
  currentState: string;
  channelId: string;
  threadId: string;
  disabled?: boolean;
  onDone: () => void | Promise<void>;
}) {
  const lc = LIFECYCLES[lifecycleKey];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!lc) return null;

  const next = lc.transitions[currentState] || [];
  if (next.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Advance</p>
        <p className="mt-1 text-xs text-zinc-400">No further transitions</p>
      </div>
    );
  }

  const advance = async (toState: string) => {
    const target = lc.states[toState];
    const needsConfirm = target && CONFIRM_KINDS.has(target.kind);
    if (needsConfirm) {
      const label = target.label || toState;
      if (!window.confirm(`Move thread to “${label}”?`)) return;
    }
    setBusy(toState);
    setError(null);
    try {
      const res = await fetch("/api/channels/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, channelId, toState, actor: "you" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`);
        return;
      }
      await onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-400">Advance</p>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
        {next.map((toState) => {
          const label = lc.states[toState]?.label || toState;
          const kind = lc.states[toState]?.kind;
          const danger = kind === "dead";
          return (
            <button
              key={toState}
              type="button"
              disabled={!!disabled || !!busy}
              onClick={() => { void advance(toState); }}
              className={`w-full rounded-md border px-3 py-2 text-left text-xs font-medium disabled:opacity-50 sm:w-auto ${
                danger
                  ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                  : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              }`}
            >
              {busy === toState ? "Working…" : `→ ${label}`}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
