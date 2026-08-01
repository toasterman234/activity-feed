import type { ReactNode } from "react";
import { cx, type UiTone, toneChipClass } from "./types";

export function StatusChip({
  tone = "neutral",
  children,
  pulse,
  className,
}: {
  tone?: UiTone;
  children: ReactNode;
  /** Force pulse even if tone isn't wait */
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide tabular-nums",
        toneChipClass[tone],
        pulse && "animate-pulse",
        className,
      )}
    >
      {children}
    </span>
  );
}
