"use client";

import { useCallback, useEffect, useState } from "react";

type ProjectDetail = {
  repo: {
    id: string;
    name: string;
    path: string;
    git_remote: string | null;
    created_at: string;
    exists_on_disk: boolean;
    scaffold_detected: boolean;
  };
  source_thread: { thread_id: string; channel_id: string; title: string; lifecycle: string; state: string } | null;
  active_thread: { thread_id: string; channel_id: string; title: string; lifecycle: string; state: string } | null;
  project_phase: {
    phase: string;
    label: string;
    reason: string;
    recommended_thread_lifecycle: string;
    recommended_action: string;
  };
  threads: Array<{
    thread_id: string;
    channel_id: string;
    lifecycle: string;
    state: string;
    archived_at: string | null;
    updated_at: string;
    title: string;
  }>;
  artifacts: Array<{
    id: string;
    thread_id: string;
    title: string;
    kind: string;
    version: string | null;
    created_at: string;
    channel_id: string;
    thread_title: string;
  }>;
  promotions: Array<{
    id: string;
    thread_id: string;
    status: string;
    progress: string | null;
    error_detail: string | null;
    created_at: string;
    completed_at: string | null;
    channel_id: string;
    thread_title: string;
  }>;
  aiwg: {
    docs: Array<{ path: string; name: string; updated_at: string; content: string }>;
    intake_docs: Array<{ path: string; name: string; updated_at: string; content: string }>;
  };
};

export function useV2ProjectDetail(repoId: string) {
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!repoId) return;
    try {
      const res = await fetch(`/api/projects/detail?repoId=${encodeURIComponent(repoId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load project detail");
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
