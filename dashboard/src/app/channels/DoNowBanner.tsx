"use client";

import type { ThreadAttentionGuide } from "./attentionGuide";

export function DoNowBanner({
  guide,
  onCta,
}: {
  guide: ThreadAttentionGuide;
  onCta?: () => void;
}) {
  return (
    <div
      id="do-now"
      className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Do this now
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{guide.why}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-amber-900/80 dark:text-amber-100/80">
            <span className="font-semibold">Next:</span> {guide.nextStep}
          </p>
        </div>
        {onCta && (
          <button
            type="button"
            onClick={onCta}
            className="shrink-0 rounded-md bg-amber-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-800 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300"
          >
            {guide.cta}
          </button>
        )}
      </div>
    </div>
  );
}
