"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
    case "fail":
    case "ready":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    case "running":
    case "testing":
    case "searching":
    case "synthesizing":
    case "in_progress":
    case "triaged":
    case "drafting":
    case "open":
    case "inbox":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
    case "verified":
    case "resolved":
    case "shipped":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    case "failed":
      return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
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

function CountPill({
  label,
  value,
  href,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  href: string;
  tone?: "neutral" | "warn" | "danger" | "good";
}) {
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

type AttentionRow = {
  key: string;
  source: "channel" | "initiative" | "inbox";
  priority: number;
  href: string;
  badge: string;
  title: string;
  meta: string;
  age: string;
};

type ContinuitySnapshot = {
  failing: number;
  open: number;
  ready: number;
  shipped: number;
  pendingInbox: number;
  attentionRows: AttentionRow[];
  inMotionInitiatives: AttentionRow[];
};

type InboxPayload = {
  decisions?: Array<{
    id: string;
    statement: string;
    channel_id: string;
    thread_id: string | null;
    channel_name: string | null;
    created_at: string;
  }>;
  proposals?: Array<{
    id: string;
    hypothesis: string;
    channel_id: string;
    thread_id: string | null;
    channel_name: string | null;
    created_at: string;
  }>;
  memoryCandidates?: Array<{
    id: string;
    text: string;
    channel_id: string;
    thread_id: string | null;
    channel_name: string | null;
    created_at: string;
  }>;
};

function useContinuitySnapshot(): ContinuitySnapshot | null {
  const [snap, setSnap] = useState<ContinuitySnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [evidenceRes, inboxRes] = await Promise.all([
          fetch("/api/ops/evidence", { cache: "no-store" }),
          fetch("/api/channels/graph-inbox", { cache: "no-store" }),
        ]);
        if (!evidenceRes.ok) return;
        const evidence = await evidenceRes.json();
        const inbox: InboxPayload = inboxRes.ok ? await inboxRes.json() : {};
        if (cancelled) return;

        const results: Array<{
          id: string;
          title: string;
          ok: boolean;
          findings: Array<{ severity: string; message: string }>;
        }> = evidence.evidence?.results || [];
        const byMap = new Map(results.map((r) => [r.id, r]));
        const initiatives: Array<{
          id: string;
          evidence_map_id: string | null;
          title: string;
          status: string;
          updated_at?: string;
          plan_path?: string | null;
        }> = evidence.initiatives || [];

        const attentionRows: AttentionRow[] = [];
        const inMotionInitiatives: AttentionRow[] = [];

        for (const init of initiatives) {
          const map = init.evidence_map_id ? byMap.get(init.evidence_map_id) : undefined;
          const findings = (map?.findings || []).filter(
            (f) => f.severity === "fail" || f.severity === "warn" || f.severity === "open",
          );
          const gateOk = map ? map.ok : true;
          const hasFail = !gateOk || findings.some((f) => f.severity === "fail");
          const hasOpen = findings.some((f) => f.severity === "open" || f.severity === "warn");
          const ready = init.status !== "shipped" && gateOk;
          const topFinding = findings[0]?.message;
          const href = `/channels/continuity/${init.id}`;
          const age = relativeTime(init.updated_at);

          if (init.status === "shipped") continue;

          if (hasFail) {
            attentionRows.push({
              key: `init-fail-${init.id}`,
              source: "initiative",
              priority: 10,
              href,
              badge: "fail",
              title: init.title,
              meta: topFinding || "Evidence checks failing",
              age,
            });
          } else if (ready) {
            attentionRows.push({
              key: `init-ready-${init.id}`,
              source: "initiative",
              priority: 40,
              href,
              badge: "ready",
              title: init.title,
              meta: "Checks pass — promote to ship",
              age,
            });
          } else if (hasOpen) {
            attentionRows.push({
              key: `init-open-${init.id}`,
              source: "initiative",
              priority: 30,
              href,
              badge: "open",
              title: init.title,
              meta: topFinding || "Open items remain",
              age,
            });
          } else if (init.status === "active" || init.status === "open") {
            inMotionInitiatives.push({
              key: `init-motion-${init.id}`,
              source: "initiative",
              priority: 50,
              href,
              badge: init.status,
              title: init.title,
              meta: init.plan_path || "Tracked initiative",
              age,
            });
          }
        }

        for (const d of inbox.decisions || []) {
          attentionRows.push({
            key: `inbox-d-${d.id}`,
            source: "inbox",
            priority: 15,
            href: d.thread_id
              ? `/channels/${d.channel_id}/${d.thread_id}`
              : "/channels/continuity/inbox",
            badge: "inbox",
            title: d.statement,
            meta: `Decision · ${d.channel_name ? `# ${d.channel_name}` : "graph"}`,
            age: relativeTime(d.created_at),
          });
        }
        for (const p of inbox.proposals || []) {
          attentionRows.push({
            key: `inbox-p-${p.id}`,
            source: "inbox",
            priority: 16,
            href: p.thread_id
              ? `/channels/${p.channel_id}/${p.thread_id}`
              : "/channels/continuity/inbox",
            badge: "inbox",
            title: p.hypothesis,
            meta: `Proposal · ${p.channel_name ? `# ${p.channel_name}` : "graph"}`,
            age: relativeTime(p.created_at),
          });
        }
        for (const m of inbox.memoryCandidates || []) {
          attentionRows.push({
            key: `inbox-m-${m.id}`,
            source: "inbox",
            priority: 17,
            href: m.thread_id
              ? `/channels/${m.channel_id}/${m.thread_id}`
              : "/channels/continuity/inbox",
            badge: "inbox",
            title: m.text,
            meta: `Memory · ${m.channel_name ? `# ${m.channel_name}` : "graph"}`,
            age: relativeTime(m.created_at),
          });
        }

        const ready = initiatives.filter((init) => {
          if (init.status === "shipped") return false;
          if (!init.evidence_map_id) return true;
          const row = byMap.get(init.evidence_map_id);
          return row ? !!row.ok : false;
        }).length;

        setSnap({
          failing: Number(evidence.summary?.failing || 0),
          open: Number(evidence.summary?.open || 0),
          ready,
          shipped: Number(evidence.summary?.shipped || 0),
          pendingInbox: Number(evidence.summary?.pendingInbox || 0),
          attentionRows,
          inMotionInitiatives,
        });
      } catch {
        /* non-critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return snap;
}

function HomeHeader({
  generatedAt,
  error,
  onRefresh,
}: {
  generatedAt: string;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <header className="rounded-xl border border-zinc-200 bg-white/95 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Home</p>
          <h1 className="mt-0.5 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Where things stand
          </h1>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            One triage list for channels, continuity, and inbox — then what&apos;s in motion.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="shrink-0 rounded-md border border-zinc-200 px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>
      <p className="mt-2 text-[10px] text-zinc-400">Updated {relativeTime(generatedAt)}</p>
      {error && (
        <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
          Refresh failed. Showing last good snapshot.
        </p>
      )}
    </header>
  );
}

function StatusStrip({
  counts,
  continuity,
}: {
  counts: HomeOverview["summaryCounts"];
  continuity: ContinuitySnapshot | null;
}) {
  const attention =
    counts.needsMe +
    counts.failed +
    (continuity?.failing || 0) +
    (continuity?.open || 0) +
    (continuity?.ready || 0) +
    (continuity?.pendingInbox || 0);

  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
      <CountPill
        label="Attention"
        value={attention}
        href="#needs-attention"
        tone={attention > 0 ? "warn" : "good"}
      />
      <CountPill
        label="Ready"
        value={continuity?.ready ?? "—"}
        href="/channels/continuity?filter=ready"
        tone={continuity?.ready ? "warn" : "neutral"}
      />
      <CountPill
        label="Inbox"
        value={continuity?.pendingInbox ?? "—"}
        href="/channels/continuity/inbox"
        tone={continuity?.pendingInbox ? "warn" : "neutral"}
      />
      <CountPill
        label="Active"
        value={counts.active}
        href="#in-motion"
        tone={counts.active > 0 ? "good" : "neutral"}
      />
      <CountPill
        label="Unread"
        value={counts.unread}
        href="/channels"
        tone={counts.unread > 0 ? "warn" : "neutral"}
      />
      <CountPill
        label="Agents"
        value={counts.agentsDown ? "down" : "up"}
        href="/models"
        tone={counts.agentsDown ? "warn" : "good"}
      />
    </div>
  );
}

function AttentionList({ rows }: { rows: AttentionRow[] }) {
  const visible = rows.slice(0, 10);
  const hidden = Math.max(0, rows.length - visible.length);

  if (visible.length === 0) {
    return <Empty text="Nothing needs you right now." />;
  }

  return (
    <div className="space-y-1.5">
      {visible.map((row) => (
        <Link
          key={row.key}
          href={row.href}
          className="block rounded-lg border border-zinc-100 px-2.5 py-2 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
        >
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${stateBadge(row.badge)}`}>
              {row.badge}
            </span>
            <span className="truncate text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
              {row.title}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-zinc-400">{row.age}</span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-zinc-400">
            {row.source === "initiative"
              ? "Continuity"
              : row.source === "inbox"
                ? "Inbox"
                : "Channels"}
            {" · "}
            {row.meta}
          </p>
        </Link>
      ))}
      {hidden > 0 && (
        <p className="text-[10px] text-zinc-400">
          +{hidden} more — open Continuity or Channels
        </p>
      )}
    </div>
  );
}

function NeedsAttentionPanel({
  data,
  continuity,
}: {
  data: HomeOverview;
  continuity: ContinuitySnapshot | null;
}) {
  const rows = useMemo(() => {
    const merged: AttentionRow[] = [...(continuity?.attentionRows || [])];

    for (const item of data.needsAttention.failedPromotions) {
      merged.push({
        key: `failed-${item.threadId}-${item.createdAt}`,
        source: "channel",
        priority: 12,
        href: `/channels/${item.channelId}/${item.threadId}`,
        badge: "failed",
        title: item.progress || item.errorDetail || "Promotion failed",
        meta: `# ${item.channelName}`,
        age: relativeTime(item.createdAt),
      });
    }
    for (const item of data.topNeedsMe) {
      merged.push({
        key: `need-${item.threadId}`,
        source: "channel",
        priority: 20,
        href: `/channels/${item.channelId}/${item.threadId}`,
        badge: item.state,
        title: item.title,
        meta: `# ${item.channelName} · ${item.reason.replace(/_/g, " ")}`,
        age: relativeTime(item.updatedAt),
      });
    }
    for (const item of data.topUnread.slice(0, 3)) {
      merged.push({
        key: `unread-${item.channelId}`,
        source: "channel",
        priority: 45,
        href: `/channels/${item.channelId}`,
        badge: `${item.unreadCount}`,
        title: `# ${item.channelName}`,
        meta: item.lastPulse ? item.lastPulse.author : "Unread channel",
        age: relativeTime(item.lastPulse?.createdAt),
      });
    }

    return merged.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
  }, [data, continuity]);

  return (
    <Card
      title="Needs attention"
      action={
        <Link
          href="/channels/continuity?filter=attention"
          className="text-[10px] font-medium text-blue-600 dark:text-blue-400"
        >
          Continuity
        </Link>
      }
    >
      <div id="needs-attention">
        <AttentionList rows={rows} />
      </div>
    </Card>
  );
}

function InMotionPanel({
  data,
  continuity,
}: {
  data: HomeOverview;
  continuity: ContinuitySnapshot | null;
}) {
  const rows: AttentionRow[] = [
    ...data.topActive.map((item) => ({
      key: `active-${item.threadId}`,
      source: "channel" as const,
      priority: 10,
      href: `/channels/${item.channelId}/${item.threadId}`,
      badge: item.state,
      title: item.title,
      meta: item.latestStep
        ? `${item.latestStep.status} · ${item.latestStep.label}`
        : `# ${item.channelName}`,
      age: "",
    })),
    ...(continuity?.inMotionInitiatives || []).slice(0, 4),
  ];

  return (
    <Card
      title="In motion"
      action={
        <Link href="/channels" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
          Channels
        </Link>
      }
    >
      <div id="in-motion" className="space-y-1.5">
        {rows.length === 0 ? (
          <Empty text="Nothing actively moving." />
        ) : (
          rows.map((row) => (
            <Link
              key={row.key}
              href={row.href}
              className="block rounded-lg border border-zinc-100 px-2.5 py-2 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
            >
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${stateBadge(row.badge)}`}>
                  {row.badge}
                </span>
                <span className="truncate text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
                  {row.title}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-zinc-400">
                {row.source === "initiative" ? "Continuity" : "Channels"} · {row.meta}
              </p>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}

function SystemPanel({ data }: { data: HomeOverview }) {
  return (
    <Card
      title="System"
      action={
        <Link href="/models" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
          Models
        </Link>
      }
    >
      <div className="space-y-2">
        <div className="rounded-lg border border-zinc-100 px-2.5 py-2 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">Agents</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                data.agents.runtimeOk
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              }`}
            >
              {data.summaryCounts.agentsDown ? "down" : "up"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-zinc-400">
            {data.agents.runtimeOk
              ? `${data.agents.liveAgents.length} live agent${data.agents.liveAgents.length === 1 ? "" : "s"}`
              : "Paseo unavailable"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-100 px-2.5 py-2 dark:border-zinc-800">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">Pulse</span>
            <Link href="/channels" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
              Channels
            </Link>
          </div>
          <div className="space-y-1">
            {data.topPulse.length === 0 ? (
              <Empty text="No channel pulse." />
            ) : (
              data.topPulse.map((channel) => {
                const summary =
                  channel.unreadCount > 0
                    ? `unread ${channel.unreadCount}`
                    : channel.states.wait > 0
                      ? `wait ${channel.states.wait}`
                      : channel.states.active > 0
                        ? `active ${channel.states.active}`
                        : channel.states.start > 0
                          ? `open ${channel.states.start}`
                          : "quiet";
                return (
                  <Link
                    key={channel.channelId}
                    href={`/channels/${channel.channelId}`}
                    className="block truncate text-[10px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    # {channel.channelName} · {summary}
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function AgentHealthCard() {
  const [health, setHealth] = useState<{
    successRate: string;
    driftRate: string;
    total: number;
  } | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const r = await fetch("/api/agent-runs/overview", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      let total = 0;
      let success = 0;
      let drifted = 0;
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
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  if (!health) return null;

  const successTone =
    parseInt(health.successRate, 10) >= 70
      ? "good"
      : parseInt(health.successRate, 10) >= 50
        ? "warn"
        : "danger";
  const driftTone =
    parseInt(health.driftRate, 10) <= 15
      ? "good"
      : parseInt(health.driftRate, 10) <= 30
        ? "warn"
        : "danger";

  return (
    <Card
      title="Agent health"
      action={
        <Link href="/runs" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
          Runs
        </Link>
      }
    >
      <div className="flex gap-2">
        <CountPill label="Success" value={health.successRate} href="/runs" tone={successTone} />
        <CountPill
          label="Drift"
          value={health.driftRate}
          href="/runs?tab=Runs&outcome=drifted"
          tone={driftTone}
        />
        <CountPill label="Runs" value={health.total} href="/runs" tone="neutral" />
      </div>
    </Card>
  );
}

export default function HomeDashboard() {
  const { data, error, loading, refresh } = useHomeOverview();
  const continuity = useContinuitySnapshot();

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-400">Loading overview…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-4 text-center dark:border-red-900 dark:bg-zinc-900">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            Home overview failed to load
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
          <button
            onClick={() => void refresh()}
            className="mt-3 rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-zinc-50 pb-16 dark:bg-zinc-950">
      <div className="mx-auto max-w-5xl space-y-2 px-3 py-2 pt-[env(safe-area-inset-top,0px)]">
        <HomeHeader
          generatedAt={data.generatedAt}
          error={error}
          onRefresh={() => void refresh()}
        />
        <StatusStrip counts={data.summaryCounts} continuity={continuity} />
        <NeedsAttentionPanel data={data} continuity={continuity} />
        <div className="grid gap-2 sm:grid-cols-2">
          <InMotionPanel data={data} continuity={continuity} />
          <SystemPanel data={data} />
          <AgentHealthCard />
        </div>
      </div>
    </div>
  );
}
