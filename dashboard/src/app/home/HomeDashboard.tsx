"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useHomeOverview } from "./useHomeOverview";
import {
  PageShell,
  Card,
  CardContent,
  StatusChip,
  Skeleton,
  type UiTone,
} from "@/components/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import FleetStatusStrip from "./FleetStatusStrip";
import { kindBadgeClass, extractAdPointer } from "@/lib/tududiConventions";

function stateTone(state: string): UiTone {
  const s = state.toLowerCase();
  if (s === "in_progress" || s === "running") return "active";
  if (s === "review") return "wait";
  if (s === "blocked" || s === "failed" || s === "fail") return "danger";
  if (s === "resolved" || s === "shipped" || s === "verified") return "good";
  if (s === "approved") return "primary";
  return "open";
}

function toneForRow(kind: string, state: string): UiTone {
  if (kind === "failed") return "danger";
  if (kind === "approved") return "primary";
  return stateTone(state);
}

function itemHref(projUid: string, item: {
  uid: string;
  note?: string;
}): string {
  const pointer = item.note ? extractAdPointer(item.note) : null;
  if (pointer?.type === "thread") return `/channels/default/${pointer.id}`;
  if (pointer?.type === "repo") return `/projects/${pointer.id}`;
  if (pointer?.type === "run") return `/runs?run=${pointer.id}`;
  return `/projects?tududi=${encodeURIComponent(projUid)}&task=${item.uid}`;
}

function HomeSkeleton() {
  return (
    <PageShell maxWidth="max-w-5xl" className="pb-4 space-y-4">
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Card size="sm">
        <CardContent className="space-y-3 py-3">
          <Skeleton className="h-3 w-20" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    </PageShell>
  );
}

export default function HomeDashboard() {
  const { data, loading, error, refresh } = useHomeOverview();

  const threadsByProject = useMemo(() => {
    const byProject = new Map<string, number>();
    if (!data) return byProject;
    for (const a of data.topActive || []) {
      for (const ref of a.tududiTasks || []) {
        if (!ref.projectName) continue;
        byProject.set(ref.projectName, (byProject.get(ref.projectName) || 0) + 1);
      }
    }
    return byProject;
  }, [data]);

  if (loading && !data) return <HomeSkeleton />;

  if (error && !data) {
    return (
      <div className="min-h-screen bg-background pb-16">
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
          <button onClick={() => void refresh()} className="mt-3 text-xs underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const failedPromotions = data.needsAttention?.failedPromotions || [];
  const needsMe = data.topNeedsMe || [];
  const hasNeedsYou = failedPromotions.length > 0 || needsMe.length > 0;
  const projects = data.tududiGlance?.ok ? data.tududiGlance.projects || [] : [];
  const active = data.topActive || [];

  type NeedRow = {
    key: string;
    href: string;
    status: string;
    tone: UiTone;
    title: string;
    channel: string;
    detail?: string;
  };

  const needRows: NeedRow[] = [
    ...failedPromotions.map((f) => ({
      key: `fp-${f.threadId}`,
      href: `/channels/${f.channelId}/${f.threadId}?need=gate`,
      status: "fail",
      tone: "danger" as UiTone,
      title: f.progress || "Promotion failed",
      channel: f.channelName,
      detail: f.errorDetail || undefined,
    })),
    ...needsMe.map((n) => {
      const need =
        n.need ||
        (n.reason === "review"
          ? "review"
          : n.reason === "blocked"
            ? "blocked"
            : n.reason === "failed_required_gate"
              ? "gate"
              : "triage");
      return {
        key: `nm-${n.threadId}`,
        href: `/channels/${n.channelId}/${n.threadId}?need=${need}`,
        status: n.state,
        tone: toneForRow(n.reason, n.state),
        title: n.title,
        channel: n.channelName,
        detail: n.why || undefined,
      };
    }),
  ];

  return (
    <PageShell maxWidth="max-w-5xl" className="pb-4">
      {(data.summaryCounts.agentsDown || !data.agents.runtimeOk) && (
        <div className="rounded-xl border border-amber-300/50 bg-amber-50/80 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/80">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Agent runtime is down
              </p>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">
                {data.agents.recoveryHint || "Check agent configuration."}
              </p>
            </div>
            <Link
              href="/ops/config?tab=models"
              className="shrink-0 rounded-md border border-amber-300 bg-card px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
            >
              Open Models
            </Link>
          </div>
        </div>
      )}

      <FleetStatusStrip />

      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Home</h1>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {active.length} active · {data.summaryCounts.unread} unread ·{" "}
            {data.summaryCounts.agentsDown ? "agents down" : "agents up"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-xs font-medium text-primary hover:underline"
        >
          Refresh
        </button>
      </div>

      {/* B — Needs You as dense table */}
      {hasNeedsYou && (
        <section className="space-y-1.5">
          <div className="flex items-baseline justify-between px-0.5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              Needs You
            </h2>
            <span className="text-[10px] text-muted-foreground">{needRows.length}</span>
          </div>
          <Card size="sm" className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 w-[72px] text-[10px]">Status</TableHead>
                  <TableHead className="h-8 text-[10px]">Item</TableHead>
                  <TableHead className="h-8 w-[28%] text-[10px]">Channel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {needRows.slice(0, 8).map((row) => (
                  <TableRow key={row.key} className="cursor-pointer">
                    <TableCell className="py-2">
                      <Link href={row.href} className="block">
                        <StatusChip tone={row.tone} className="text-[9px]">
                          {row.status}
                        </StatusChip>
                      </Link>
                    </TableCell>
                    <TableCell className="py-2">
                      <Link href={row.href} className="block min-w-0">
                        <p className="truncate text-sm font-medium">{row.title}</p>
                        {row.detail && (
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {row.detail}
                          </p>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="py-2">
                      <Link href={row.href} className="block truncate text-xs text-muted-foreground">
                        # {row.channel}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>
      )}

      {/* A — Projects as accordion; trigger meta is table-dense */}
      <section className="space-y-1.5">
        <div className="flex items-baseline justify-between px-0.5">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Projects
          </h2>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {data.tududiGlance?.ok && (
              <span>
                {data.tududiGlance.total_open ?? 0} open
                {data.tududiGlance.total_blocked
                  ? ` · ${data.tududiGlance.total_blocked} blocked`
                  : ""}
              </span>
            )}
            <Link href="/projects" className="text-primary hover:underline">
              All →
            </Link>
          </div>
        </div>

        {data.tududiGlance && !data.tududiGlance.ok && (
          <Card size="sm">
            <CardContent className="px-3 py-2">
              <p className="text-[10px] text-red-600 dark:text-red-400">
                Tududi: {data.tududiGlance.error || "unreachable"}
              </p>
            </CardContent>
          </Card>
        )}

        {projects.length === 0 && data.tududiGlance?.ok && (
          <Card size="sm">
            <CardContent className="px-3 py-6 text-center text-xs text-muted-foreground">
              No projects with open signal.
            </CardContent>
          </Card>
        )}

        {projects.length > 0 && (
          <Card size="sm" className="overflow-hidden py-0">
            {/* Column legend — table density on accordion triggers */}
            <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_4rem_4.5rem] gap-2 border-b border-border px-3 py-1.5 text-[10px] text-muted-foreground">
              <span>Project</span>
              <span className="text-right tabular-nums">Open</span>
              <span className="text-right tabular-nums">Blocked</span>
              <span className="text-right tabular-nums">Working</span>
            </div>
            <Accordion multiple className="px-1">
              {projects.slice(0, 8).map((proj) => {
                const working = threadsByProject.get(proj.name) || 0;
                return (
                  <AccordionItem key={proj.uid} value={proj.uid} className="border-border px-2">
                    <AccordionTrigger className="py-2.5 hover:no-underline">
                      <div className="grid w-full grid-cols-[minmax(0,1fr)_3.5rem_4rem_4.5rem] items-center gap-2 pr-2 text-left">
                        <span className="truncate text-sm font-medium">{proj.name}</span>
                        <span className="text-right text-xs tabular-nums text-muted-foreground">
                          {proj.open_count}
                        </span>
                        <span
                          className={`text-right text-xs tabular-nums ${
                            proj.blocked_count > 0
                              ? "font-medium text-red-600 dark:text-red-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {proj.blocked_count || "—"}
                        </span>
                        <span className="text-right text-xs tabular-nums text-muted-foreground">
                          {working || "—"}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-2">
                      <ul className="space-y-1 border-l border-border/60 pl-3">
                        {(proj.items || []).slice(0, 5).map((item) => (
                          <li key={item.uid}>
                            <Link
                              href={itemHref(proj.uid, item)}
                              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-muted/60"
                            >
                              {item.blocked ? (
                                <StatusChip tone="danger" className="text-[9px]">
                                  blocked
                                </StatusChip>
                              ) : item.kind && item.kind !== "task" ? (
                                <span
                                  className={`shrink-0 rounded px-1 text-[9px] font-medium uppercase ${kindBadgeClass(item.kind)}`}
                                >
                                  {item.kind}
                                  {item.stage ? `:${item.stage}` : ""}
                                </span>
                              ) : item.status === 1 ? (
                                <StatusChip tone="active" className="text-[9px]">
                                  active
                                </StatusChip>
                              ) : null}
                              <span className="min-w-0 truncate">
                                {item.repo ? `${item.repo} · ` : ""}
                                {item.name}
                              </span>
                            </Link>
                          </li>
                        ))}
                        {(proj.items?.length || 0) === 0 && (
                          <li className="px-1.5 py-1 text-[10px] text-muted-foreground">
                            No open items
                          </li>
                        )}
                      </ul>
                      <div className="mt-1.5 px-1.5">
                        <Link
                          href={`/projects?tududi=${encodeURIComponent(proj.uid)}`}
                          className="text-[10px] text-primary hover:underline"
                        >
                          Open in Projects →
                        </Link>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </Card>
        )}
      </section>
    </PageShell>
  );
}
