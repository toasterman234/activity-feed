"use client";

import { LIFECYCLES, walkOrder, type LifecycleState } from "./lifecycles";

const KIND_COLORS: Record<string, string> = {
  start: "bg-zinc-100 border-zinc-300 text-zinc-600",
  active: "bg-blue-50 border-blue-300 text-blue-700",
  wait: "bg-amber-50 border-amber-300 text-amber-700",
  proven: "bg-teal-50 border-teal-300 text-teal-700",
  done: "bg-emerald-50 border-emerald-400 text-emerald-700",
  dead: "bg-red-50 border-red-300 text-red-500",
};

const KIND_DOT: Record<string, string> = {
  start: "bg-zinc-400",
  active: "bg-blue-500",
  wait: "bg-amber-500",
  proven: "bg-teal-500",
  done: "bg-emerald-500",
  dead: "bg-red-500",
};

const KIND_RING: Record<string, string> = {
  start: "ring-zinc-400",
  active: "ring-blue-500",
  wait: "ring-amber-500",
  proven: "ring-teal-500",
  done: "ring-emerald-500",
  dead: "ring-red-500",
};

export function StateFlow({ lifecycleKey, currentState }: {
  lifecycleKey: string;
  currentState: string;
}) {
  const lc = LIFECYCLES[lifecycleKey];
  if (!lc) {
    return <p className="text-xs text-zinc-400">Unknown lifecycle: {lifecycleKey}</p>;
  }

  const order = walkOrder(lc);
  const currentLabel = lc.states[currentState]?.label || currentState;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          State — {lc.label}
        </p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${KIND_COLORS[lc.states[currentState]?.kind] || ""}`}>
          ● now: {currentLabel}
        </span>
      </div>
      <div className="flex flex-col">
        {order.map((stateKey, i) => {
          const s = lc.states[stateKey];
          const isCurrent = stateKey === currentState;
          const isSide = s.kind === "dead" || (s.kind === "wait" && stateKey !== lc.initial);

          return (
            <div key={stateKey} className="flex items-start">
              {/* Connector line */}
              <div className="flex shrink-0 flex-col items-center mr-2" style={{ width: 20 }}>
                {i > 0 && <div className="w-px h-2 bg-zinc-200 dark:bg-zinc-700" />}
                <div
                  className={`w-2.5 h-2.5 rounded-full ${KIND_DOT[s.kind] || "bg-zinc-400"}`}
                />
                {i < order.length - 1 && <div className="w-px flex-1 min-h-[4px] bg-zinc-200 dark:bg-zinc-700" />}
              </div>
              {/* State label */}
              <div
                className={`mb-1 flex-1 rounded-md border px-2.5 py-1 text-xs ${
                  isCurrent
                    ? `ring-1 ${KIND_RING[s.kind] || "ring-zinc-400"} ${KIND_COLORS[s.kind] || ""}`
                    : KIND_COLORS[s.kind] || "bg-zinc-50 border-zinc-200 text-zinc-500"
                } ${isSide ? "ml-4 opacity-80" : ""}`}
              >
                <span className="font-medium">{s.label}</span>
                {isCurrent && (
                  <span className="ml-1.5 rounded-full bg-current/10 px-1.5 py-0.5 text-[9px] font-semibold">current</span>
                )}
                {s.terminal && (
                  <span className="ml-1 text-[9px] text-zinc-400">(terminal)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
