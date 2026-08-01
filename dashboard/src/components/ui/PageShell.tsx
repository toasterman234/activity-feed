import type { ReactNode } from "react";
import { cx } from "./types";

export function PageShell({
  children,
  maxWidth = "max-w-5xl",
  className,
}: {
  children: ReactNode;
  maxWidth?: "max-w-5xl" | "max-w-6xl";
  className?: string;
}) {
  return (
    <div className={cx("min-h-screen bg-background pb-16", className)}>
      <div
        className={cx(
          "mx-auto space-y-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]",
          maxWidth,
        )}
      >
        {children}
      </div>
    </div>
  );
}
