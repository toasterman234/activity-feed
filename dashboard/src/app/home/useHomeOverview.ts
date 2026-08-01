"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChannelRollup } from "../api/home/_queries";

// Backwards-compat HomeOverview for mobile-v2 hooks that import the old type shape
// New code should use the individual { summary, needsYou, projects, activity } split.
export type HomeOverview = Record<string, unknown> & {
  summaryCounts: { unread: number; needsMe: number; active: number; failed: number; agentsDown: boolean };
  agents: { runtimeOk: boolean; recoveryHint: string; signals: Record<string, string> };
  topUnread?: Array<{ channelId: string; channelName: string; unreadCount: number; lastPulse: { author: string; snippet: string; createdAt: string } | null }>;
  topNeedsMe?: Array<{ threadId: string; channelId: string; channelName: string; title: string; state: string; reason: string }>;
};

// ── Type definitions (subset of the old HomeOverview, now split across 4 endpoints) ──

export type HomeSummary = {
  generatedAt: string;
  agents: {
    runtimeOk: boolean;
    runtimeError: string | null;
    liveAgents: Array<{
      id: string; shortId: string; name: string; provider: string;
      status: string; cwd: string;
    }>;
    signals: {
      paseo: "ok" | "missing" | "error";
      piBin: "ok" | "missing" | "error";
      workRuns: "ok" | "stale" | "none" | "error";
    };
    recoveryHint: string;
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
};

export type HomeNeedsYou = {
  generatedAt: string;
  topNeedsMe: Array<{
    threadId: string;
    channelId: string;
    channelName: string;
    title: string;
    lifecycle: string;
    state: string;
    assignee: string | null;
    reason: string;
    updatedAt: string;
    why?: string;
    nextStep?: string;
    need?: string | null;
  }>;
  needsAttention: {
    approvalThreads: Array<{
      threadId: string;
      channelId: string;
      channelName: string;
      title: string;
      lifecycle: string;
      state: string;
      assignee: string | null;
      reason: string;
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
};

export type HomeProjects = {
  generatedAt: string;
  tududiGlance: {
    ok: true;
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
  } | {
    ok: false;
    error: string;
  };
};

export type HomeActivity = {
  generatedAt: string;
  summaryCounts: {
    unread: number;
    needsMe: number;
    active: number;
    failed: number;
    agentsDown: boolean;
  };
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
  topPulse: ChannelRollup[];
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
  channels: ChannelRollup[];
  agents: {
    recentActivity: Array<{
      author: string;
      source: string;
      snippet: string;
      createdAt: string;
      channelId: string;
      channelName: string | null;
      threadId: string | null;
    }>;
  };
};

const POLL_MS = 10_000;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}

export function useHomeOverview() {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [needsYou, setNeedsYou] = useState<HomeNeedsYou | null>(null);
  const [projects, setProjects] = useState<HomeProjects | null>(null);
  const [activity, setActivity] = useState<HomeActivity | null>(null);

  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [needsYouError, setNeedsYouError] = useState<string | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  const [summaryLoading, setSummaryLoading] = useState(true);
  const [needsYouLoading, setNeedsYouLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const refresh = useCallback(async () => {
    // Fetch all 4 in parallel — each updates independently
    void fetchJson<HomeSummary>("/api/home/summary")
      .then(setSummary, (e) => { if (!summary) setSummaryError(String(e)); })
      .finally(() => setSummaryLoading(false));

    void fetchJson<HomeNeedsYou>("/api/home/needs-you")
      .then(setNeedsYou, (e) => { if (!needsYou) setNeedsYouError(String(e)); })
      .finally(() => setNeedsYouLoading(false));

    void fetchJson<HomeProjects>("/api/home/projects")
      .then(setProjects, (e) => { if (!projects) setProjectsError(String(e)); })
      .finally(() => setProjectsLoading(false));

    void fetchJson<HomeActivity>("/api/home/activity")
      .then(setActivity, (e) => { if (!activity) setActivityError(String(e)); })
      .finally(() => setActivityLoading(false));
  }, []);

  useEffect(() => {
    void refresh();
    pollRef.current = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  return {
    summary, needsYou, projects, activity,
    summaryError, needsYouError, projectsError, activityError,
    summaryLoading, needsYouLoading, projectsLoading, activityLoading,
    refresh,
  };
}
