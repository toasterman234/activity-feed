"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState, useCallback } from "react";
import { useHomeOverview, type HomeOverview } from "./useHomeOverview";

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

function stateBadge(state: string | null | undefined) {
  switch (state) {
    case "review":
    case "blocked":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    case "running":
    case "testing":
    case "searching":
    case "synthesizing":
    case "in_progress":
    case "triaged":
    case "drafting":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
    case "verified":
    case "resolved":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    case "open":
    case "drafted":
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[11px] text-zinc-400">{text}</p>;
}

function CountPill({ label, value, href, tone = "neutral" }: { label: string; value: string | number; href: string; tone?: "neutral" | "warn" | "danger" | "good"; }) {
  const toneClass =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
      : tone === "danger"
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        : tone === "good"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
          : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";

  return (
    <Link href={href} className={`rounded-lg border px-2 py-1 text-center ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-75">{label}</div>
      <div className="text-sm font-semibold leading-tight">{value}</div>
    </Link>
  );
}

function HomeHeader({ generatedAt, error, onRefresh }: { generatedAt: string; error: string | null; onRefresh: () => void; }) {
  return (
    <header className="rounded-xl border border-zinc-200 bg-white/95 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Home</p>
          <h1 className="mt-0.5 text-base font-semibold text-zinc-900 dark:text-zinc-100">Overview</h1>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">Everything important, one screen.</p>
        </div>
        <button onClick={onRefresh} className="shrink-0 rounded-md border border-zinc-200 px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Refresh</button>
      </div>
      <p className="mt-2 text-[10px] text-zinc-400">Updated {relativeTime(generatedAt)}</p>
      {error && <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">Refresh failed. Showing last good snapshot.</p>}
    </header>
  );
}

function StatusStrip({ counts }: { counts: HomeOverview["summaryCounts"] }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      <CountPill label="Unread" value={counts.unread} href="/channels" tone={counts.unread > 0 ? "warn" : "neutral"} />
      <CountPill label="Needs me" value={counts.needsMe} href="/channels" tone={counts.needsMe > 0 ? "warn" : "neutral"} />
      <CountPill label="Active" value={counts.active} href="/channels" tone={counts.active > 0 ? "good" : "neutral"} />
      <CountPill label="Failed" value={counts.failed} href="/channels" tone={counts.failed > 0 ? "danger" : "neutral"} />
      <CountPill label="Agents" value={counts.agentsDown ? "down" : "up"} href="/models" tone={counts.agentsDown ? "warn" : "good"} />
    </div>
  );
}

type NeedsRow =
  | { key: string; kind: "failed"; href: string; badge: string; title: string; meta: string; age: string }
  | { key: string; kind: "thread"; href: string; badge: string; title: string; meta: string; age: string }
  | { key: string; kind: "channel"; href: string; badge: string; title: string; meta: string; age: string };

function NeedsMePanel({ data }: { data: HomeOverview }) {
  const rows: NeedsRow[] = [
    ...data.needsAttention.failedPromotions.map((item) => ({
      key: `failed-${item.threadId}-${item.createdAt}`,
      kind: "failed" as const,
      href: `/channels/${item.channelId}/${item.threadId}`,
      badge: item.status,
      title: item.progress || item.errorDetail || "Promotion failed",
      meta: `# ${item.channelName}`,
      age: relativeTime(item.createdAt),
    })),
    ...data.topNeedsMe.map((item) => ({
      key: `need-${item.threadId}`,
      kind: "thread" as const,
      href: `/channels/${item.channelId}/${item.threadId}`,
      badge: item.state,
      title: item.title,
      meta: `# ${item.channelName}`,
      age: relativeTime(item.updatedAt),
    })),
    ...data.topUnread.map((item) => ({
      key: `unread-${item.channelId}`,
      kind: "channel" as const,
      href: `/channels/${item.channelId}`,
      badge: `${item.unreadCount}`,
      title: `# ${item.channelName}`,
      meta: item.lastPulse ? item.lastPulse.author : "No recent pulse",
      age: relativeTime(item.lastPulse?.createdAt),
    })),
  ];

  const visible = rows.slice(0, 3);
  const hiddenCount = Math.max(0, rows.length - visible.length);

  return (
    <Card title="Needs me" action={<Link href="/channels" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">See all</Link>}>
      <div className="space-y-1.5">
        {visible.length === 0 ? <Empty text="Nothing waiting on you." /> : visible.map((row) => (
          <Link key={row.key} href={row.href} className="block rounded-lg border border-zinc-100 px-2.5 py-2 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60">
            <div className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${row.kind === "failed" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : row.kind === "channel" ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" : stateBadge(row.badge)}`}>{row.badge}</span>
              <span className="truncate text-[11px] font-medium text-zinc-800 dark:text-zinc-200">{row.title}</span>
              <span className="ml-auto shrink-0 text-[10px] text-zinc-400">{row.age}</span>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-zinc-400">{row.meta}</p>
          </Link>
        ))}
        {hiddenCount > 0 && <p className="text-[10px] text-zinc-400">+{hiddenCount} more</p>}
      </div>
    </Card>
  );
}

function ActiveWorkPanel({ data }: { data: HomeOverview }) {
  return (
    <Card title="Active work" action={<Link href="/channels" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">See all</Link>}>
      <div className="space-y-1.5">
        {data.topActive.length === 0 ? <Empty text="No active work." /> : data.topActive.map((item) => (
          <Link key={item.threadId} href={`/channels/${item.channelId}/${item.threadId}`} className="block rounded-lg border border-zinc-100 px-2.5 py-2 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60">
            <div className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${stateBadge(item.state)}`}>{item.state}</span>
              <span className="truncate text-[11px] font-medium text-zinc-800 dark:text-zinc-200">{item.title}</span>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-zinc-400">{item.latestStep ? `${item.latestStep.status} · ${item.latestStep.label}` : `# ${item.channelName}`}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function ThreadsPanel({ data }: { data: HomeOverview }) {
  return (
    <Card title="Threads" action={<Link href="/channels" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">See all</Link>}>
      <div className="space-y-1.5">
        {data.topThreads.length === 0 ? <Empty text="No tracked threads." /> : data.topThreads.map((thread) => (
          <Link key={thread.threadId} href={`/channels/${thread.channelId}/${thread.threadId}`} className="block rounded-lg border border-zinc-100 px-2.5 py-2 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60">
            <div className="flex items-center gap-2">
              {thread.state && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${stateBadge(thread.state)}`}>{thread.state}</span>}
              <span className="truncate text-[11px] font-medium text-zinc-800 dark:text-zinc-200">{thread.title}</span>
              <span className="ml-auto shrink-0 text-[10px] text-zinc-400">{relativeTime(thread.lastMessageAt || thread.updatedAt)}</span>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-zinc-400"># {thread.channelName} · {thread.replyCount} repl{thread.replyCount === 1 ? "y" : "ies"}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function SystemPanel({ data }: { data: HomeOverview }) {
  return (
    <Card title="System" action={<Link href="/models" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Models</Link>}>
      <div className="space-y-2">
        <div className="rounded-lg border border-zinc-100 px-2.5 py-2 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">Agents</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${data.agents.runtimeOk ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>{data.summaryCounts.agentsDown ? "down" : "up"}</span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-zinc-400">{data.agents.runtimeOk ? `${data.agents.liveAgents.length} live agent${data.agents.liveAgents.length === 1 ? "" : "s"}` : "Paseo unavailable"}</p>
        </div>
        <div className="rounded-lg border border-zinc-100 px-2.5 py-2 dark:border-zinc-800">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">Pulse</span>
            <Link href="/channels" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Channels</Link>
          </div>
          <div className="space-y-1">
            {data.topPulse.length === 0 ? <Empty text="No channel pulse." /> : data.topPulse.map((channel) => {
              const summary = channel.unreadCount > 0
                ? `unread ${channel.unreadCount}`
                : channel.states.wait > 0
                  ? `wait ${channel.states.wait}`
                  : channel.states.active > 0
                    ? `active ${channel.states.active}`
                    : channel.states.start > 0
                      ? `open ${channel.states.start}`
                      : "quiet";
              return (
                <Link key={channel.channelId} href={`/channels/${channel.channelId}`} className="block truncate text-[10px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"># {channel.channelName} · {summary}</Link>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function HomeDashboard() {
  const { data, error, loading, refresh } = useHomeOverview();

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-zinc-400">Loading overview…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-4 text-center dark:border-red-900 dark:bg-zinc-900">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">Home overview failed to load</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
          <button onClick={() => void refresh()} className="mt-3 rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16">
      <div className="mx-auto max-w-5xl space-y-2 px-3 py-2 pt-[env(safe-area-inset-top,0px)]">
        <HomeHeader generatedAt={data.generatedAt} error={error} onRefresh={() => void refresh()} />
        <StatusStrip counts={data.summaryCounts} />
        <div className="grid gap-2 sm:grid-cols-2">
          <NeedsMePanel data={data} />
          <ActiveWorkPanel data={data} />
          <ThreadsPanel data={data} />
          <SystemPanel data={data} />
          <ContinuityEvidenceCard />
          <AgentHealthCard />
        </div>
      </div>
    </div>
  );
}

function ContinuityEvidenceCard() {
  const [summary, setSummary] = useState<{
    failing: number;
    warnings: number;
    open: number;
    pendingInbox: number;
    ready: number;
    shipped: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ops/evidence", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const results = data.evidence?.results || [];
        const byMap = new Map(results.map((r) => [r.id, r]));
        const initiatives = data.initiatives || [];
        const ready = initiatives.filter((init) => {
          if (init.status === "shipped") return false;
          if (!init.evidence_map_id) return true;
          const row = byMap.get(init.evidence_map_id);
          return row ? !!row.ok : false;
        }).length;
        setSummary({
          failing: Number(data.summary?.failing || 0),
          warnings: Number(data.summary?.warnings || 0),
          open: Number(data.summary?.open || 0),
          pendingInbox: Number(data.summary?.pendingInbox || 0),
          ready,
          shipped: Number(data.summary?.shipped || 0),
        });
      } catch {
        /* non-critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!summary) return null;
  const attention = summary.failing + summary.warnings + summary.open + summary.pendingInbox;
  return (
    <Card
      title="Continuity"
      action={<Link href="/channels/continuity?filter=attention" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Continuity</Link>}
    >
      {attention === 0 && summary.ready === 0 ? (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Checks clean · {summary.shipped} shipped · inbox empty.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <CountPill label="Fails" value={summary.failing} href="/channels/continuity?filter=attention" tone={summary.failing ? "danger" : "good"} />
          <CountPill label="Open" value={summary.open} href="/channels/continuity?filter=attention" tone={summary.open ? "warn" : "good"} />
          <CountPill label="Ready" value={summary.ready} href="/channels/continuity?filter=ready" tone={summary.ready ? "warn" : "good"} />
          <CountPill label="Inbox" value={summary.pendingInbox} href="/channels/continuity/inbox" tone={summary.pendingInbox ? "warn" : "good"} />
        </div>
      )}
    </Card>
  );
}


function AgentHealthCard() {
  const [health, setHealth] = useState<{ successRate: string; driftRate: string; total: number } | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const r = await fetch("/api/agent-runs/overview", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      // Calculate overall success/drift rates across all sources
      let total = 0, success = 0, drifted = 0;
      for (const outcomes of Object.values(d.bySourceOutcome || {}) as Record<string, number>[]) {
        for (const [outcome, count] of Object.entries(outcomes)) {
          const n = Number(count) || 0;
          total += n;
          if (outcome === "success") success += n;
          if (outcome === "drifted") drifted += n;
        }
      }
      if (total > 0) {
        setHealth({
          successRate: `${Math.round((success / total) * 100)}%`,
          driftRate: `${Math.round((drifted / total) * 100)}%`,
          total,
        });
      }
    } catch { /* silent — health card is non-critical */ }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  if (!health) return null;

  const successTone = parseInt(health.successRate) >= 70 ? "good" : parseInt(health.successRate) >= 50 ? "warn" : "danger";
  const driftTone = parseInt(health.driftRate) <= 15 ? "good" : parseInt(health.driftRate) <= 30 ? "warn" : "danger";

  return (
    <Card title="Agent health" action={<Link href="/runs" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Runs</Link>}>
      <div className="flex gap-2">
        <CountPill label="Success" value={health.successRate} href="/runs" tone={successTone} />
        <CountPill label="Drift" value={health.driftRate} href="/runs?tab=Runs&outcome=drifted" tone={driftTone} />
        <CountPill label="Runs" value={health.total} href="/runs" tone="neutral" />
      </div>
    </Card>
  );
}
