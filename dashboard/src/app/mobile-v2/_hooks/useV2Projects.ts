"use client";

import { useCallback, useEffect, useState } from "react";
import type { MobileRepo } from "@/app/mobile/_hooks/useMobileProjects";

const POLL_MS = 30000;

export function useV2Projects() {
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
