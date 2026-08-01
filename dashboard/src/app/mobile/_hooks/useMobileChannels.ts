"use client";

import { useCallback, useEffect, useState } from "react";

export type MobileChannel = {
  channelId: string;
  unreadCount: number;
  threadCount: number;
  states: { start: number; active: number; wait: number; proven: number };
  waitingPreview: Array<{
    threadId: string;
    title: string;
    reason: "unread" | "wait";
    updatedAt: string;
  }>;
  lastPulse: { author: string; snippet: string; createdAt: string } | null;
};

const POLL_MS = 15000;

export function useMobileChannels() {
  const [channels, setChannels] = useState<MobileChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/channels/activity?viewer=you", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load channels");
      setChannels(json.channels || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { channels, loading, error, refresh };
}
