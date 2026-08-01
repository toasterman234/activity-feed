// ── Data freshness indicator ──
// Reusable badge showing data age and quality for any computed value.
// All three Analytics views share this.

"use client";

import { useState } from "react";

export type FreshnessLevel = "live" | "recent" | "stale" | "unknown";

export interface FreshnessInfo {
  level: FreshnessLevel;
  label: string;
  detail: string;
  source: string;
}

export function freshnessFromAge(ageMs: number | null, thresholdMin: number = 5): FreshnessInfo {
  if (ageMs == null) return { level: "unknown", label: "Unknown", detail: "No timestamp available", source: "N/A" };
  const minutes = ageMs / 60000;
  if (minutes < 1) return { level: "live", label: "Live", detail: "Updated <1 min ago", source: "Electric / Market Lake" };
  if (minutes < thresholdMin) return { level: "recent", label: "Recent", detail: `Updated ${minutes.toFixed(0)}m ago`, source: "Electric / Market Lake" };
  return { level: "stale", label: "Stale", detail: `Updated ${minutes.toFixed(0)}m ago`, source: "Electric / Market Lake" };
}

const FRESHNESS_COLORS: Record<FreshnessLevel, string> = {
  live: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  recent: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  stale: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800",
  unknown: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
};

export function DataFreshnessBadge({
  info,
  asOf,
}: {
  info: FreshnessInfo;
  asOf?: string;
}) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={() => setShowDetail(!showDetail)}
        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${FRESHNESS_COLORS[info.level]}`}
        title={info.detail}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${
          info.level === "live" ? "bg-emerald-500" :
          info.level === "recent" ? "bg-amber-500" :
          info.level === "stale" ? "bg-red-500" :
          "bg-zinc-400"
        }`} />
        {info.label}
      </button>
      {showDetail && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-zinc-600 dark:text-zinc-300">{info.detail}</p>
          <p className="mt-0.5 text-zinc-400">Source: {info.source}</p>
          {asOf && <p className="mt-0.5 text-zinc-400">As of: {new Date(asOf).toLocaleString()}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Methodology info button — tap to see how a metric is calculated.
 */
export function MethodologyBadge({
  methodology,
}: {
  methodology: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={() => setShow(!show)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-medium text-zinc-400 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        title="How is this calculated?"
      >
        ?
      </button>
      {show && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-zinc-200 bg-white p-2 text-xs leading-relaxed text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {methodology}
        </div>
      )}
    </div>
  );
}
