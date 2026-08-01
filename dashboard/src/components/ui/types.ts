import type { ReactNode } from "react";

/** Shared tone keys for status chips / row accents. */
export type UiTone =
  | "wait"
  | "active"
  | "open"
  | "proven"
  | "neutral"
  | "danger"
  | "good"
  | "primary";

export const toneAccentClass: Record<UiTone, string> = {
  wait: "bg-status-wait",
  active: "bg-status-active",
  open: "bg-status-open",
  proven: "bg-status-proven",
  neutral: "bg-border",
  danger: "bg-status-danger",
  good: "bg-status-good",
  primary: "bg-primary",
};

export const toneChipClass: Record<UiTone, string> = {
  wait: "border-status-wait bg-status-wait text-status-wait-fg shadow-sm shadow-status-wait/40 animate-pulse",
  active: "border-status-active bg-status-active text-status-active-fg shadow-sm shadow-status-active/40",
  open: "border-status-open bg-status-open text-status-open-fg shadow-sm shadow-status-open/35",
  proven: "border-emerald-500/30 bg-status-proven text-status-proven-fg",
  neutral: "border-border bg-muted text-foreground",
  danger: "border-status-danger bg-status-danger text-status-danger-fg shadow-sm shadow-status-danger/35",
  good: "border-emerald-500/30 bg-status-good text-status-good-fg",
  primary: "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30",
};

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type { ReactNode };
