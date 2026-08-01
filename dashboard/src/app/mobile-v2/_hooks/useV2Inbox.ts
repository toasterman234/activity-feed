"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HomeOverview } from "@/app/home/useHomeOverview";
import type { MobileChannel } from "@/app/mobile/_hooks/useMobileChannels";

export type V2InboxChannel = MobileChannel & {
  channelName: string;
};

const POLL_MS = 15000;

export function useV2Inbox() {
  const [channels, setChannels] = useState<MobileChannel[]>([]);
  const [overview, setOverview] = useState<HomeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const channelsRes = await fetch("/api/channels/activity?viewer=you", { cache: "no-store" });
      const channelsJson = await channelsRes.json();
      if (!channelsRes.ok) throw new Error(channelsJson?.error || "Failed to load inbox channels");

      setChannels(channelsJson.channels || []);
      setError(null);
      setLoading(false);

      void fetch("/api/home/overview", { cache: "no-store" })
        .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
        .then(({ ok, json }) => {
          if (!ok) throw new Error(json?.error || "Failed to load inbox overview");
          setOverview(json);
        })
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const enrichedChannels = useMemo<V2InboxChannel[]>(() => {
    const nameById = new Map((overview?.channels || []).map((item) => [item.channelId, item.channelName]));
    return channels.map((channel) => ({
      ...channel,
      channelName: nameById.get(channel.channelId) || channel.channelId,
    }));
  }, [channels, overview?.channels]);

  const channelDetails = useMemo(() => {
    const byChannel = new Map<string, {
      needsMe: HomeOverview["topNeedsMe"];
      active: HomeOverview["topActive"];
      threads: HomeOverview["topThreads"];
    }>();
    if (!overview) return byChannel;

    for (const item of overview.topNeedsMe || []) {
      const row = byChannel.get(item.channelId) || { needsMe: [], active: [], threads: [] };
      row.needsMe.push(item);
      byChannel.set(item.channelId, row);
    }
    for (const item of overview.topActive || []) {
      const row = byChannel.get(item.channelId) || { needsMe: [], active: [], threads: [] };
      row.active.push(item);
      byChannel.set(item.channelId, row);
    }
    for (const item of overview.topThreads || []) {
      const row = byChannel.get(item.channelId) || { needsMe: [], active: [], threads: [] };
      row.threads.push(item);
      byChannel.set(item.channelId, row);
    }
    return byChannel;
  }, [overview]);

  return {
    channels: enrichedChannels,
    overview,
    summaryCounts: overview?.summaryCounts || null,
    channelDetails,
    loading,
    error,
    refresh,
  };
}
