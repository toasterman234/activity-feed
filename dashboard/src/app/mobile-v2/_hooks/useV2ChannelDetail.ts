"use client";

import { useCallback, useEffect, useState } from "react";

const POLL_MS = 15000;

export type V2ChannelThread = {
  threadId: string;
  channelId: string;
  title: string;
  lifecycle: string | null;
  state: string | null;
  assignee: string | null;
  repoId: string | null;
  repoName: string | null;
  promotedTo: string | null;
  archivedAt: string | null;
  updatedAt: string | null;
  replyCount: number;
  unreadReplyCount: number;
  hasUnread: boolean;
  lastAuthor: string | null;
  lastMessageAt: string | null;
  lastSnippet: string | null;
};

export type V2ChannelDetail = {
  channel: { id: string; name: string | null };
  threads: V2ChannelThread[];
};

export function useV2ChannelDetail(channelId: string) {
  const [data, setData] = useState<V2ChannelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/channel-detail?channelId=${encodeURIComponent(channelId)}&includeArchived=true&viewer=you`, { cache: "no-store" });
      const json = (await res.json()) as V2ChannelDetail & { error?: string };
      if (!res.ok) throw new Error(json?.error || "Failed to load channel detail");
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { data, loading, error, refresh };
}
