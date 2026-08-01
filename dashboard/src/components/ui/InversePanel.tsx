import type { ReactNode } from "react";
import { cx } from "./types";

/** Dark control-room surfaces (Fleet hero, action rail). Uses inverse tokens — not `dark:` or raw zinc. */
export function InversePanel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cx(
        "overflow-hidden rounded-3xl border border-inverse-border bg-inverse text-inverse-foreground shadow-lg shadow-black/20",
        padded && "p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function InverseStat({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-inverse-border/80 bg-inverse-foreground/5 p-3",
        className,
      )}
    >
      <div className="text-[11px] uppercase tracking-wide text-inverse-muted">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
