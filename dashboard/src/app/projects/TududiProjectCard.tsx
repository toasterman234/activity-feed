"use client";

import Link from "next/link";
import { Card, CardContent, DividedList, StatusChip, cx, type UiTone } from "@/components/ui";
import { kindBadgeClass, extractAdPointer } from "@/lib/tududiConventions";

export type TududiProjectPulseItem = {
  uid: string;
  name: string;
  status: number;
  kind: string;
  stage: string | null;
  blocked: boolean;
  repo?: string | null;
  note?: string;
};

export type TududiProjectPulse = {
  uid: string;
  name: string;
  open_count: number;
  blocked_count: number;
  incident_count: number;
  items?: TududiProjectPulseItem[];
  /** Optional: active AD threads already joined to this project */
  workingCount?: number;
  /** Optional: linked registered repo names (only when attached) */
  linkedRepoNames?: string[];
};

function itemHref(projUid: string, item: TududiProjectPulseItem): string {
  const pointer = item.note ? extractAdPointer(item.note) : null;
  if (pointer?.type === "thread") return `/channels/default/${pointer.id}`;
  if (pointer?.type === "repo") return `/projects/${pointer.id}`;
  if (pointer?.type === "run") return `/runs?run=${pointer.id}`;
  return `/projects?tududi=${encodeURIComponent(projUid)}&task=${item.uid}`;
}

function accentFor(proj: TududiProjectPulse): UiTone {
  if (proj.blocked_count > 0) return "danger";
  if (proj.incident_count > 0) return "wait";
  return "open";
}

function metaLine(project: TududiProjectPulse): string {
  return [
    `${project.open_count} open`,
    project.blocked_count > 0 ? `${project.blocked_count} blocked` : null,
    project.incident_count > 0 ? `${project.incident_count} incident` : null,
    project.workingCount && project.workingCount > 0 ? `${project.workingCount} working` : null,
    project.linkedRepoNames?.length ? project.linkedRepoNames.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function RowShell({
  accent,
  href,
  onClick,
  selected,
  children,
}: {
  accent: UiTone;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  children: React.ReactNode;
}) {
  const classes = cx(
    "relative flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/60 active:bg-muted",
    selected && "bg-muted/40",
  );
  const body = (
    <>
      {accent !== "neutral" ? (
        <span
          className={cx(
            "absolute inset-y-0 left-0 w-1",
            accent === "danger" && "bg-red-500",
            accent === "wait" && "bg-amber-500",
            accent === "active" && "bg-sky-500",
            accent === "open" && "bg-violet-500",
            accent === "good" && "bg-emerald-500",
            accent === "primary" && "bg-primary",
          )}
        />
      ) : null}
      <div className="min-w-0 flex-1 pl-1.5">{children}</div>
    </>
  );
  if (href) {
    return (
      <li>
        <Link href={href} className={classes}>
          {body}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={onClick} className={classes}>
        {body}
      </button>
    </li>
  );
}

/**
 * Shared Tududi project surface.
 * - `compact`: one row for Home pulse
 * - default: card with optional item preview for Projects / Home Plan
 */
export function TududiProjectCard({
  project,
  compact = false,
  selected = false,
  maxItems = 3,
  onSelect,
  href,
}: {
  project: TududiProjectPulse;
  compact?: boolean;
  selected?: boolean;
  maxItems?: number;
  onSelect?: (uid: string) => void;
  /** Override navigation; default /projects?tududi= */
  href?: string;
}) {
  const target = href ?? `/projects?tududi=${encodeURIComponent(project.uid)}`;
  const meta = metaLine(project);
  const accent = accentFor(project);

  if (compact) {
    return (
      <RowShell
        accent={accent}
        href={onSelect ? undefined : target}
        onClick={onSelect ? () => onSelect(project.uid) : undefined}
        selected={selected}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-xs font-medium">{project.name}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{meta}</span>
        </div>
      </RowShell>
    );
  }

  return (
    <Card
      size="sm"
      className={cx(selected && "ring-1 ring-primary/40", onSelect && "cursor-pointer")}
      onClick={onSelect ? () => onSelect(project.uid) : undefined}
      role={onSelect ? "button" : undefined}
    >
      <CardContent className="!px-0">
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
          <h3 className="truncate text-xs font-semibold text-foreground">{project.name}</h3>
          <span className="shrink-0 text-[10px] text-muted-foreground">{meta}</span>
          {!onSelect && (
            <Link href={target} className="ml-auto shrink-0 text-[10px] text-primary hover:underline">
              →
            </Link>
          )}
          {onSelect && (
            <span
              className={cx(
                "ml-auto shrink-0 text-[10px]",
                selected ? "text-primary" : "text-muted-foreground",
              )}
            >
              {selected ? "selected" : "open →"}
            </span>
          )}
        </div>
        {project.items && project.items.length > 0 && (
          <>
            <DividedList>
              {project.items.slice(0, maxItems).map((item) => {
                const tone: UiTone = item.blocked ? "danger" : item.status === 1 ? "active" : "open";
                const body = (
                  <div className="flex min-w-0 items-center gap-1.5">
                    {item.blocked ? (
                      <StatusChip tone="danger" className="text-[9px]">
                        blocked
                      </StatusChip>
                    ) : item.kind && item.kind !== "task" ? (
                      <span
                        className={`shrink-0 rounded px-1 py-0 text-[9px] font-medium uppercase ${kindBadgeClass(item.kind)}`}
                      >
                        {item.kind}
                        {item.stage ? `:${item.stage}` : ""}
                      </span>
                    ) : item.status === 1 ? (
                      <StatusChip tone="active" className="text-[9px]">
                        active
                      </StatusChip>
                    ) : null}
                    <span className="truncate text-xs">
                      {item.repo ? `${item.repo} · ` : ""}
                      {item.name}
                    </span>
                  </div>
                );
                return (
                  <RowShell
                    key={item.uid}
                    accent={tone}
                    href={onSelect ? undefined : itemHref(project.uid, item)}
                  >
                    {body}
                  </RowShell>
                );
              })}
            </DividedList>
            {project.items.length > maxItems && (
              <div className="border-b border-border/50 px-3 py-1">
                <Link
                  href={target}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={(e) => onSelect && e.stopPropagation()}
                >
                  +{project.items.length - maxItems} more →
                </Link>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
