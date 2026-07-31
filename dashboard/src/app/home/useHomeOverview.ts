"use client";

import { useCallback, useEffect, useState } from "react";

export type HomeOverview = {
  generatedAt: string;
  summaryCounts: {
    unread: number;
    needsMe: number;
    active: number;
    failed: number;
    agentsDown: boolean;
  };
  topUnread: Array<{
    channelId: string;
    channelName: string;
    unreadCount: number;
    lastPulse: { author: string; snippet: string; createdAt: string } | null;
  }>;
  topNeedsMe: Array<{
    threadId: string;
    channelId: string;
    channelName: string;
    title: string;
    lifecycle: string;
    state: string;
    assignee: string | null;
    reason: "review" | "blocked" | "failed_required_gate" | "issue_needs_triage";
    updatedAt: string;
    why?: string;
    nextStep?: string;
    need?: string | null;
  }>;
  topActive: Array<{
    threadId: string;
    channelId: string;
    channelName: string;
    title: string;
    lifecycle: string;
    state: string;
    latestStep: { label: string; status: string; detail: string | null; createdAt: string | null } | null;
    promotion: { status: string; progress: string | null } | null;
    tududiTasks: Array<{ externalId: string; taskName: string; taskUid: string; projectName: string }>;
  }>;
  topThreads: Array<{
    threadId: string;
    channelId: string;
    channelName: string;
    title: string;
    lifecycle: string | null;
    state: string | null;
    assignee: string | null;
    repoName: string | null;
    replyCount: number;
    lastAuthor: string | null;
    lastMessageAt: string | null;
    updatedAt: string | null;
    tududiTasks: Array<{ externalId: string; taskName: string; taskUid: string; projectName: string }>;
  }>;
  topPulse: Array<{
    channelId: string;
    channelName: string;
    unreadCount: number;
    states: { start: number; active: number; wait: number; proven: number };
    lastPulse: { author: string; snippet: string; createdAt: string } | null;
  }>;
  needsAttention: {
    unreadChannels: Array<{
      channelId: string;
      channelName: string;
      unreadCount: number;
      lastPulse: { author: string; snippet: string; createdAt: string } | null;
    }>;
    approvalThreads: Array<{
      threadId: string;
      channelId: string;
      channelName: string;
      title: string;
      lifecycle: string;
      state: string;
      assignee: string | null;
      reason: "review" | "blocked" | "failed_required_gate" | "issue_needs_triage";
      updatedAt: string;
      why?: string;
      nextStep?: string;
      need?: string | null;
    }>;
    failedPromotions: Array<{
      threadId: string;
      channelId: string;
      channelName: string;
      status: string;
      progress: string | null;
      errorDetail: string | null;
      createdAt: string;
      why?: string;
      nextStep?: string;
    }>;
  };
  recentHighlights: Array<{
    id: string | number;
    source: string;
    summary: string;
    project: string | null;
    sessionId: string | null;
    createdAt: string;
    importance: "high" | "normal";
  }>;
  threadActivity: Array<{
    threadId: string;
    channelId: string;
    channelName: string;
    title: string;
    lifecycle: string | null;
    state: string | null;
    assignee: string | null;
    repoName: string | null;
    replyCount: number;
    lastAuthor: string | null;
    lastMessageAt: string | null;
    updatedAt: string | null;
    tududiTasks: Array<{ externalId: string; taskName: string; taskUid: string; projectName: string }>;
  }>;
  approvedPlans: Array<{
    threadId: string;
    channelId: string;
    channelName: string;
    title: string;
    repoName: string | null;
    repoId: string | null;
    assignee: string | null;
    taskCount: number;
    approvedAt: string | null;
    updatedAt: string;
    activeExecutionCount: number;
  }>;
  workStatus: {
    active: Array<{
      threadId: string;
      channelId: string;
      channelName: string;
      title: string;
      lifecycle: string;
      state: string;
      latestStep: { label: string; status: string; detail: string | null; createdAt: string | null } | null;
      promotion: { status: string; progress: string | null } | null;
      tududiTasks: Array<{ externalId: string; taskName: string; taskUid: string; projectName: string }>;
    }>;
  };
  agents: {
    runtimeOk: boolean;
    runtimeError: string | null;
    liveAgents: Array<{
      id: string;
      shortId: string;
      name: string;
      provider: string;
      status: string;
      cwd: string;
    }>;
    recentActivity: Array<{
      author: string;
      source: string;
      snippet: string;
      createdAt: string;
      channelId: string | null;
      channelName: string | null;
      threadId: string | null;
    }>;
    signals?: {
      paseo: "ok" | "missing" | "error";
      piBin: "ok" | "missing" | "error";
      workRuns: "ok" | "stale" | "none" | "error";
    };
    recoveryHint?: string;
  };
  channels: Array<{
    channelId: string;
    channelName: string;
    unreadCount: number;
    states: { start: number; active: number; wait: number; proven: number };
    lastPulse: { author: string; snippet: string; createdAt: string } | null;
  }>;
  tududiGlance?: {
    ok: boolean;
    error?: string;
    public_base?: string;
    total_open?: number;
    total_blocked?: number;
    projects?: Array<{
      uid: string;
      name: string;
      open_count: number;
      blocked_count: number;
      incident_count: number;
      sort_key?: number;
      items: Array<{
        uid: string;
        name: string;
        status: number;
        kind: string;
        stage: string | null;
        outcome: string | null;
        blocked: boolean;
        repo: string | null;
        note: string;
      }>;
    }>;
  };
};

const POLL_MS = 10_000;

export function useHomeOverview() {
  const [data, setData] = useState<HomeOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/home/overview", { cache: "no-store" });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || `HTTP ${response.status}`);
      setData(next as HomeOverview);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, error, loading, refresh };
}
