"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useHomeOverview, type HomeOverview } from "./useHomeOverview";
import {
  PageShell,
  StatusChip,
  Badge,
  Card,
  CardContent,
  DividedList,
  DividedRow,
  cx,
  type UiTone,
} from "@/components/ui";
import { HomeKanbanBoard, type HomeKanbanCard } from "./HomeKanbanBoard";

// ── helpers ──

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return iso;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

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

// ── section heading ──

function SectionHeading({
  tone,
  label,
  count,
}: {
  tone: "amber" | "muted" | "neutral";
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <h2
        className={cx(
          "text-[10px] font-semibold uppercase tracking-wider",
          tone === "amber"
            ? "text-amber-600 dark:text-amber-400"
            : "text-muted-foreground",
        )}
      >
        {label}
      </h2>
      <div className="h-3 w-px bg-border" />
      <span className="text-[10px] text-muted-foreground">{count} items</span>
    </div>
  );
}

// ── accent row wrapper ──

function AccentRow({
  tone,
  href,
  children,
}: {
  tone: UiTone;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <DividedRow href={href} accent={tone}>
      {children}
    </DividedRow>
  );
}

// ── HOME DASHBOARD (post-promote density + hybrid Channels) ──

export default function HomeDashboard() {
  const { data, loading, error, refresh } = useHomeOverview();
  const [view, setView] = useState<"list" | "board">("list");

  // Build lookup maps for enrichment (all hooks MUST run before any conditional return)
  const threadActivityById = useMemo(() => {
    const m: Record<string, HomeOverview["threadActivity"][number]> = {};
    if (!data) return m;
    for (const t of [...(data.topThreads || []), ...(data.threadActivity || [])]) {
      if (!m[t.threadId] || (t.lastMessageAt || "") > (m[t.threadId].lastMessageAt || "")) {
        m[t.threadId] = t;
      }
    }
    return m;
  }, [data]);

  // Channels hybrid C: top channels by unread/recent, each with one nested recent thread
  const channelGroups = useMemo(() => {
    if (!data) return [];
    const channels = data.topPulse || [];
    const byChannel = new Map<string, {
      ch: (typeof channels)[number];
      bestThread: HomeOverview["threadActivity"][number] | null;
    }>();
    const sorted = [...channels].sort((a, b) => {
      if ((b.unreadCount ?? 0) !== (a.unreadCount ?? 0)) return (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
      return (b.lastPulse?.createdAt || "").localeCompare(a.lastPulse?.createdAt || "");
    });
    for (const ch of sorted.slice(0, 6)) {
      byChannel.set(ch.channelId, { ch, bestThread: null });
    }
    for (const t of [...(data.topThreads || []), ...(data.threadActivity || [])]) {
      const entry = byChannel.get(t.channelId);
      if (!entry) continue;
      if (!entry.bestThread || (t.lastMessageAt || "") > (entry.bestThread.lastMessageAt || "")) {
        entry.bestThread = t;
      }
    }
    return [...byChannel.values()];
  }, [data]);

  // Build kanban cards from topThreads + threadActivity
  const kanbanCards: HomeKanbanCard[] = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const cards: HomeKanbanCard[] = [];
    for (const t of [...(data.topThreads || []), ...(data.threadActivity || [])]) {
      if (seen.has(t.threadId)) continue;
      seen.add(t.threadId);
      cards.push({
        id: t.threadId,
        threadId: t.threadId,
        channelId: t.channelId,
        channelName: t.channelName,
        title: t.title,
        state: t.state || "open",
        assignee: t.assignee,
        replyCount: t.replyCount,
        lastAuthor: t.lastAuthor,
        lastMessageAt: t.lastMessageAt,
        updatedAt: t.updatedAt,
      });
    }
    return cards;
  }, [data]);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-16">
        <p className="text-sm text-muted-foreground animate-pulse">
          Loading…
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-background pb-16">
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
          <button
            onClick={() => void refresh()}
            className="mt-3 text-xs underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const failedPromotions = data?.needsAttention?.failedPromotions || [];
  const needsMe = data?.topNeedsMe || [];
  const active = data?.topActive || [];
  const hasNeedsYou = failedPromotions.length > 0 || needsMe.length > 0;

  return (
    <PageShell maxWidth="max-w-5xl" className="pb-4">
      {/* Agent runtime warning */}
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
              className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
            >
              Open Models
            </Link>
          </div>
        </div>
      )}

      {/* Compact header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Activity</h1>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {active.length} active · {data?.summaryCounts?.unread ?? 0} unread ·{" "}
            {data?.summaryCounts?.agentsDown ? "agents down" : "agents up"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setView("board")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                view === "board"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Board
            </button>
          </div>
          <button
            onClick={() => void refresh()}
            className="text-xs font-medium text-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>

      {view === "board" ? (
        <HomeKanbanBoard cards={kanbanCards} />
      ) : (<>
      {/* Needs You */}
      {hasNeedsYou && (
        <section>
          <SectionHeading
            tone="amber"
            label="Needs You"
            count={failedPromotions.length + needsMe.length}
          />
          <Card size="sm">
            <CardContent className="!px-0">
              <DividedList>
                {failedPromotions.map((f) => (
                  <AccentRow
                    key={`fp-${f.threadId}`}
                    tone="danger"
                    href={`/channels/${f.channelId}/${f.threadId}?need=gate`}
                  >
                    <div className="flex items-center gap-2">
                      <StatusChip tone="danger">fail</StatusChip>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate font-medium">
                          {f.progress || "Promotion failed"}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          # {f.channelName}
                          {f.errorDetail ? ` — ${f.errorDetail}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                        {relativeTime(f.createdAt)}
                      </span>
                    </div>
                  </AccentRow>
                ))}
                {needsMe.map((n) => {
                  const tone = toneForRow(n.reason, n.state);
                  const badge = n.reason === "blocked" ? "blocked" : n.state;
                  const need = n.need || (
                    n.reason === "review" ? "review"
                    : n.reason === "blocked" ? "blocked"
                    : n.reason === "failed_required_gate" ? "gate"
                    : "triage"
                  );
                  return (
                    <AccentRow
                      key={`nm-${n.threadId}`}
                      tone={tone}
                      href={`/channels/${n.channelId}/${n.threadId}?need=${need}`}
                    >
                      <div className="flex items-center gap-2">
                        <StatusChip tone={tone}>{badge}</StatusChip>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate font-medium">
                            {n.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                            # {n.channelName}
                            {n.why ? ` — ${n.why}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                          {relativeTime(n.updatedAt)}
                        </span>
                      </div>
                    </AccentRow>
                  );
                })}
              </DividedList>
            </CardContent>
          </Card>
        </section>
      )}

      {/* In Motion — enriched with thread activity */}
      <section>
        <SectionHeading
          tone="muted"
          label="In Motion"
          count={active.length}
        />
        <Card size="sm">
          <CardContent className="!px-0">
            <DividedList
              empty={
                active.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Nothing active.
                  </span>
                ) : undefined
              }
            >
              {active.map((a) => {
                const tone = stateTone(a.state);
                const ta = threadActivityById[a.threadId];
                // Build meta line: #channel · assignee · step-or-last-reply · time
                const metaParts: string[] = [`# ${a.channelName}`];
                if (ta?.assignee) metaParts.push(ta.assignee);
                if (a.latestStep) {
                  metaParts.push(`${a.latestStep.status} — ${a.latestStep.label}`);
                } else if (ta?.lastAuthor) {
                  metaParts.push(`${ta.lastAuthor} replied`);
                }
                if (ta?.lastMessageAt) metaParts.push(relativeTime(ta.lastMessageAt));
                else if (ta?.updatedAt) metaParts.push(relativeTime(ta.updatedAt));

                return (
                  <AccentRow
                    key={`im-${a.threadId}`}
                    tone={tone}
                    href={`/channels/${a.channelId}/${a.threadId}`}
                  >
                    <div className="flex items-center gap-2">
                      <StatusChip tone={tone}>{a.state}</StatusChip>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate font-medium">
                          {a.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {metaParts.join(" · ")}
                        </p>
                      </div>
                    </div>
                  </AccentRow>
                );
              })}
            </DividedList>
          </CardContent>
        </Card>
      </section>

      {/* Channels — hybrid C: channel header + one nested recent thread */}
      {channelGroups.length > 0 && (
        <section>
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Channels
          </h2>
          <Card size="sm">
            <CardContent className="!px-0">
              <DividedList>
                {channelGroups.map(({ ch, bestThread }) => {
                  const waitCount = (ch.states?.wait ?? 0) + (ch.states?.active ?? 0);
                  return (
                    <li key={ch.channelId}>
                      {/* Channel header */}
                      <Link
                        href={`/channels/${ch.channelId}`}
                        className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/60 transition-colors"
                      >
                        <span className={cx("text-sm font-semibold", ch.unreadCount > 0 && "text-foreground")}>
                          # {ch.channelName}
                        </span>
                        {ch.unreadCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {ch.unreadCount > 99 ? "99+" : ch.unreadCount}
                          </Badge>
                        )}
                        {waitCount > 0 && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 tabular-nums">
                            {waitCount} waiting
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-muted-foreground">→</span>
                      </Link>
                      {/* Nested recent thread */}
                      {bestThread ? (
                        <Link
                          href={`/channels/${bestThread.channelId}/${bestThread.threadId}`}
                          className="flex items-center gap-2 px-4 py-2 pl-8 border-t border-border/50 hover:bg-muted/40 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs truncate">{bestThread.title}</p>
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                              {bestThread.replyCount > 0 ? `${bestThread.replyCount} repl${bestThread.replyCount === 1 ? "y" : "ies"}` : "No replies"}
                              {bestThread.lastAuthor ? ` · ${bestThread.lastAuthor}` : ""}
                              {bestThread.lastMessageAt ? ` · ${relativeTime(bestThread.lastMessageAt)}` : ""}
                            </p>
                          </div>
                        </Link>
                      ) : (
                        <div className="px-4 py-2 pl-8 border-t border-border/50">
                          <p className="text-[10px] text-muted-foreground">No recent threads</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </DividedList>
            </CardContent>
          </Card>
        </section>
      )}
      </>)}
    </PageShell>
  );
}
