"use client";

import { useCallback, useEffect, useState } from "react";

const POLL_MS = 15000;

type ThreadMessage = {
  id: string;
  author: string | null;
  body: string;
  createdAt: string;
};

type ThreadDetail = {
  thread: {
    threadId: string;
    channelId: string;
    channelName: string;
    title: string;
    rootAuthor: string | null;
    rootBody: string;
    createdAt: string;
    lifecycle: string | null;
    state: string | null;
    assignee: string | null;
    repoId: string | null;
    repoName: string | null;
    repoPath: string | null;
    promotedTo: string | null;
    archivedAt: string | null;
    updatedAt: string | null;
  };
  replies: ThreadMessage[];
};

type ThreadExtras = {
  plans: Array<{ id: string; title: string; status: string; sort_order: number }>;
  steps: Array<{ id: string; step_label: string; status: string; detail: string | null; created_at: string }>;
  artifacts: Array<{ id: string; title: string; kind: string; version: number; created_at: string }>;
  meta: {
    lifecycle?: string | null;
    state?: string | null;
    assignee?: string | null;
    repo_id?: string | null;
    promoted_to?: string | null;
    archived_at?: string | null;
    updated_at?: string | null;
  } | null;
};

export function useV2Thread(channelId: string, threadId: string) {
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [extras, setExtras] = useState<ThreadExtras | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [detailRes, extrasRes] = await Promise.all([
        fetch(`/api/channels/thread-detail?channelId=${encodeURIComponent(channelId)}&threadId=${encodeURIComponent(threadId)}`, { cache: "no-store" }),
        fetch(`/api/channels/thread-extras?threadId=${encodeURIComponent(threadId)}`, { cache: "no-store" }),
      ]);
      const detailJson = (await detailRes.json()) as ThreadDetail & { error?: string };
      const extrasJson = (await extrasRes.json()) as ThreadExtras & { error?: string };
      if (!detailRes.ok) throw new Error(detailJson?.error || "Failed to load thread detail");
      if (!extrasRes.ok) throw new Error(extrasJson?.error || "Failed to load thread extras");
      setDetail(detailJson);
      setExtras(extrasJson);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [channelId, threadId]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { detail, extras, loading, error, refresh };
}
