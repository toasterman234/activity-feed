import Link from "next/link";
import { Children, type ReactNode } from "react";
import { cx, type UiTone, toneAccentClass } from "./types";

export function ListStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("flex flex-col gap-2.5", className)}>{children}</div>;
}

export function ListRow({
  href,
  accent = "neutral",
  emphasize,
  children,
  className,
  onClick,
}: {
  href?: string;
  accent?: UiTone;
  /** Stronger border/ring for unread / attention */
  emphasize?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className={cx("absolute inset-y-0 left-0 w-1.5", toneAccentClass[accent])} />
      <div className="min-w-0 flex-1 pl-1.5">{children}</div>
    </>
  );

  const classes = cx(
    "relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border bg-card px-4 py-3.5 text-left shadow-sm transition",
    "hover:-translate-y-0.5 hover:shadow-md active:translate-y-0",
    emphasize ? "border-primary/40 ring-1 ring-primary/20" : "border-border",
    accent === "wait" && !emphasize && "border-amber-300/70",
    accent === "active" && !emphasize && "border-sky-300/70",
    accent === "open" && !emphasize && "border-violet-300/70",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes} onClick={onClick}>
        {body}
      </Link>
    );
  }

  return (
    <div className={classes} onClick={onClick} role={onClick ? "button" : undefined}>
      {body}
    </div>
  );
}

/** Divided list inside one card (threads, dense lists). */
export function DividedList({
  children,
  className,
  empty,
}: {
  children: ReactNode;
  className?: string;
  empty?: ReactNode;
}) {
  const hasChildren = Children.count(children) > 0;
  return (
    <div className={cx("overflow-hidden rounded-2xl border border-border bg-card shadow-sm", className)}>
      <ul className="divide-y divide-border">
        {!hasChildren && empty ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</li> : null}
        {children}
      </ul>
    </div>
  );
}

export function DividedRow({
  href,
  accent,
  children,
  className,
}: {
  href: string;
  accent?: UiTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cx(
          "relative flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-muted/60 active:bg-muted",
          className,
        )}
      >
        {accent && accent !== "neutral" ? (
          <span className={cx("absolute inset-y-0 left-0 w-1", toneAccentClass[accent])} />
        ) : null}
        <div className="min-w-0 flex-1 pl-1.5">{children}</div>
      </Link>
    </li>
  );
}
