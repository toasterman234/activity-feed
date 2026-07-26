import type { Collection } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ShapeMaterialization } from "@electric-circuits/client";
import {
  client, ACTIVITY_LOG_SHAPE, CHANNELS_SHAPE, CHANNEL_MEMBERS_SHAPE, MESSAGES_SHAPE,
} from "../electric";
import { acquireShape, releaseShape } from "../shape-registry";
import { startMeasure } from "@/lib/perf";

// ── shape getters (refcounted — always pair with release*) ─────────
//
// Budget note (ADR-003): a page may hold at most SHAPE_BUDGET live shapes.
// Channel + thread pages share the same 3 keys (channels/members/messages);
// per-thread data (plans/steps/artifacts) is POLLED via useThreadExtras
// below instead of holding three more long-poll streams.

export function getActShape(): Promise<ShapeMaterialization> {
  return acquireShape("activity-log", () =>
    fetch("/api/activity-log-cutoff")
      .then((r) => r.json())
      .then(({ cutoff }) =>
        client.shape({
          ...ACTIVITY_LOG_SHAPE,
          where: {
            or: [
              { col: "id", op: "gt", value: cutoff },
              { col: "source", op: "eq", value: "claude-code" },
              { col: "source", op: "eq", value: "pi" },
            ],
          },
        }),
      ),
  );
}
export function releaseActShape(): void {
  releaseShape("activity-log");
}

export function getChannelShape(): Promise<ShapeMaterialization> {
  return acquireShape("channels", () => client.shape(CHANNELS_SHAPE));
}
export function releaseChannelShape(): void {
  releaseShape("channels");
}

export function getMemberShape(): Promise<ShapeMaterialization> {
  return acquireShape("channel-members", () => client.shape(CHANNEL_MEMBERS_SHAPE));
}
export function releaseMemberShape(): void {
  releaseShape("channel-members");
}

export function getMessageShape(): Promise<ShapeMaterialization> {
  return acquireShape("messages", () => client.shape(MESSAGES_SHAPE));
}
export function releaseMessageShape(): void {
  releaseShape("messages");
}

// ── data hooks ───────────────────────────────────────────────────

export interface ChannelRow { id: string; name: string; description: string; default_lifecycle: string | null; created_at: string }
export interface MemberRow { id: string; channel_id: string; member_type: string; member_name: string; created_at: string }
export interface MessageRow { id: string; channel_id: string; thread_id: string | null; author: string; body: string; created_at: string }
export interface ThreadPlanRow { id: string; thread_id: string; title: string; status: string; sort_order: number; created_at: string; updated_at: string }
export interface WorkflowStepRow { id: string; thread_id: string; step_label: string; status: string; detail: string; created_at: string }
export interface ThreadArtifactRow { id: string; thread_id: string; title: string; kind: string; content: string; version: number; created_at: string }
export interface ThreadMetaRow { thread_id: string; channel_id: string; lifecycle: string; state: string; enabled_workflows: string; research_mode: string | null; priority: string | null; assignee: string | null; repo_id: string | null; labels: string | null; promoted_to: string | null; archived_at: string | null; updated_at: string }
export interface ThreadPromotionRow { id: string; thread_id: string; repo_path: string | null; status: string; error_detail: string | null; agent_provider: string | null; agent_model: string | null; progress: string | null; created_at: string; completed_at: string | null }
export interface ActivityEventRow { id: string; thread_id: string; run_id: string; seq: number; kind: string; label: string; detail: string; status: string; created_at: string; updated_at: string }
export interface RepoRow { id: string; name: string; path: string; git_remote: string | null; created_at: string }

export function useChannelRows(m: ShapeMaterialization): ChannelRow[] {
  const coll = m.collection as Collection<ChannelRow, string>;
  const { data } = useLiveQuery(
    (q) => q.from({ c: coll }).select(({ c }) => ({
      id: c.id, name: c.name, description: c.description, default_lifecycle: c.default_lifecycle, created_at: c.created_at,
    })),
    [coll],
  );
  return (data as ChannelRow[]);
}

export function useMemberRows(m: ShapeMaterialization): MemberRow[] {
  const coll = m.collection as Collection<MemberRow, string>;
  const { data } = useLiveQuery(
    (q) => q.from({ x: coll }).select(({ x }) => ({
      id: x.id, channel_id: x.channel_id, member_type: x.member_type, member_name: x.member_name, created_at: x.created_at,
    })),
    [coll],
  );
  return (data as MemberRow[]);
}

export function useMessageRows(m: ShapeMaterialization): MessageRow[] {
  const coll = m.collection as Collection<MessageRow, string>;
  const { data } = useLiveQuery(
    (q) => q.from({ x: coll }).select(({ x }) => ({
      id: x.id, channel_id: x.channel_id, thread_id: x.thread_id, author: x.author, body: x.body, created_at: x.created_at,
    })),
    [coll],
  );
  return (data as MessageRow[]);
}

// ── thread extras: polled, not streamed (ADR-003) ────────────────
//
// plans / workflow steps / artifacts are per-thread secondary data. Holding
// three more live shapes put the thread page at 6 long-polls — the entire
// HTTP/1.1 connection budget — which froze navigation (stuck "Rendering"
// pill on back). client.query() is a one-shot server-filtered read with no
// held connection, so we poll it instead.

export interface ThreadExtras {
  plans: ThreadPlanRow[];
  steps: WorkflowStepRow[];
  artifacts: ThreadArtifactRow[];
  meta: ThreadMetaRow | null;
  promotion: ThreadPromotionRow | null;
  /** Live agent activity trace (thinking/tool/status), ordered oldest→newest.
   *  Rides this existing poll — NOT a held Electric shape (ADR-003). */
  activity: ActivityEventRow[];
  /** Force an immediate refetch (call after a local write, e.g. plan toggle). */
  refresh: () => Promise<void>;
}

const THREAD_EXTRAS_POLL_MS = 3000;

export function useThreadExtras(threadId: string): ThreadExtras {
  const [data, setData] = useState<Omit<ThreadExtras, "refresh">>({
    plans: [], steps: [], artifacts: [], meta: null, promotion: null, activity: [],
  });

  const refresh = useCallback(async () => {
    // Measured: this poll replaced three live shapes (ADR-003), so thread
    // detail freshness now depends on its latency. See /perf.
    const stop = startMeasure("channels.threadExtras");
    try {
      const res = await fetch(`/api/channels/thread-extras?threadId=${encodeURIComponent(threadId)}`, {
        cache: "no-store",
      });
      const next = await res.json();
      if (!res.ok) return;
      const promoRows = (next.promotions || []) as ThreadPromotionRow[];
      setData({
        plans: (next.plans || []) as ThreadPlanRow[],
        steps: (next.steps || []) as WorkflowStepRow[],
        artifacts: (next.artifacts || []) as ThreadArtifactRow[],
        meta: (next.meta as ThreadMetaRow | null) || null,
        promotion: promoRows.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null,
        activity: (next.activity || []) as ActivityEventRow[],
      });
    } catch {
      /* transient poll failure — keep last data, next tick retries */
    } finally {
      stop();
    }
  }, [threadId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, THREAD_EXTRAS_POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { ...data, refresh };
}

// ── project options (for member autocomplete) ────────────────────

interface ActivityRow { id: string; detail: string }

export function useProjectOptions(m: ShapeMaterialization): string[] {
  const coll = m.collection as Collection<ActivityRow, string>;
  const { data } = useLiveQuery(
    (q) => q.from({ a: coll }).select(({ a }) => ({ id: a.id, detail: a.detail })),
    [coll],
  );
  return useMemo(() => {
    const projects = new Set<string>();
    for (const r of data as ActivityRow[]) {
      if (!r.detail) continue;
      try {
        const p = JSON.parse(r.detail)?.project;
        if (p) projects.add(p);
      } catch { /* not JSON */ }
    }
    return [...projects].sort();
  }, [data]);
}

// ── utils ────────────────────────────────────────────────────────

export function relativeTime(iso: string): string {
  const d = Date.now() - Date.parse(iso); if (isNaN(d)) return iso;
  const s = Math.floor(d / 1000); if (s < 60) return "now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const dy = Math.floor(h / 24); if (dy < 7) return `${dy}d`;
  return new Date(Date.parse(iso)).toLocaleDateString();
}

// ── issues: poll thread_meta for a channel ─────────────────────

export function useChannelThreadMeta(channelId: string, pollMs = 4000): ThreadMetaRow[] {
  const [meta, setMeta] = useState<ThreadMetaRow[]>([]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/channels/thread-meta?channelId=${encodeURIComponent(channelId)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!active || !res.ok) return;
        setMeta((data.rows as ThreadMetaRow[]) || []);
      } catch { /* transient — keep stale data */ }
    };
    void poll();
    const id = setInterval(() => { if (!document.hidden) void poll(); }, pollMs);
    return () => { active = false; clearInterval(id); };
  }, [channelId, pollMs]);

  return meta;
}

export function useIssuesMeta(channelId: string, pollMs = 4000): ThreadMetaRow[] {
  return useChannelThreadMeta(channelId, pollMs).filter((r) => r.lifecycle === "issue");
}
