"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FLEET_HOSTS, type FleetSnapshot } from "@/lib/fleet";

const POLL_MS = 30_000;

export function useFleetSnapshot() {
  const [data, setData] = useState<FleetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const mergedHosts = useMemo(() => {
    const liveById = new Map((data?.hosts || []).map((h) => [h.id, h]));
    return FLEET_HOSTS.map((host) => {
      const live = liveById.get(host.id);
      return live ? { ...host, ...live } : host;
    });
  }, [data]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/fleet", { cache: "no-store" });
      const next = await res.json();
      if (!res.ok || !next.ok) throw new Error(next?.error || `HTTP ${res.status}`);
      setData(next as FleetSnapshot);
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

  return { data, mergedHosts, error, loading, refresh };
}
