"use client";

import { useCallback, useEffect, useState } from "react";

export type MobileRepo = {
  id: string;
  name: string;
  path: string;
  git_remote: string | null;
  active_thread_count: number;
  archived_thread_count: number;
  scaffold_detected: boolean;
  exists_on_disk: boolean;
  source_thread_id: string | null;
  source_channel_id: string | null;
};

const POLL_MS = 30000;

export function useMobileProjects() {
  const [repos, setRepos] = useState<MobileRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/repos", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load projects");
      setRepos(json.repos || []);
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

  return { repos, loading, error, refresh };
}
