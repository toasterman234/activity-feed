import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./types";

export function AppHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  actions,
  sticky = true,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  sticky?: boolean;
}) {
  return (
    <header
      className={cx(
        "z-10 border-b border-border bg-card/95 backdrop-blur",
        sticky && "sticky top-0",
      )}
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {backHref ? (
            <Link
              href={backHref}
              className="-ml-1 shrink-0 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              aria-label={backLabel}
            >
              ← {backLabel}
            </Link>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{title}</h1>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}
