"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startMeasure } from "@/lib/perf";
import { resolveLinkedRepos, type LinkableRepo } from "@/lib/tududiProjectLinks";

const POLL_MS = 30000;

type TududiProject = {
  id: number;
  uid: string;
  name: string;
  description?: string | null;
  status?: string | null;
};

type TududiTask = {
  id: number;
  uid: string;
  name: string;
  status_label?: string;
  status?: number | string;
  note?: string | null;
  kind?: string;
  stage?: string | null;
  path?: string | null;
  outcome?: string | null;
  blocked?: boolean;
  repo?: string | null;
};

type TududiTemplate = {
  uid: string;
  name: string;
  description?: string | null;
  template_category?: string | null;
  task_count?: number;
};

type TududiOverview = {
  ok: boolean;
  configured?: boolean;
  error?: string;
  public_base?: string;
  projects?: TududiProject[];
  selected_project?: TududiProject | null;
  tasks?: TududiTask[];
  templates?: TududiTemplate[];
  open_count?: number;
  done_count?: number;
  convention_counts?: {
    stages?: number;
    decisions?: number;
    forks?: number;
  };
};

type RepoListResponse = { repos?: LinkableRepo[] };

type TududiDebug = {
  targetUid?: string;
  projectsFetchMs?: number;
  reposFetchMs?: number;
  detailFetchMs?: number;
  usedCache?: boolean;
  tasksReturned?: number;
  projectsReturned?: number;
  selectedResolvedUid?: string;
  at?: string;
};

export function useV2TududiOverview(selectedProjectUid?: string) {
  const [projectsData, setProjectsData] = useState<TududiOverview | null>(null);
  const [selectedData, setSelectedData] = useState<TududiOverview | null>(null);
  const [repos, setRepos] = useState<LinkableRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<TududiDebug | null>(null);
  const selectedCacheRef = useRef<Record<string, TududiOverview>>({});

  const refresh = useCallback(async () => {
    const overviewStop = startMeasure("mobile-v2.projects.overview");
    try {
      const projectsStartedAt = performance.now();
      const reposStartedAt = performance.now();
      const [projectsRes, reposRes] = await Promise.all([
        fetch("/api/tududi", { cache: "no-store" }),
        fetch("/api/repos", { cache: "no-store" }),
      ]);
      const projectsFetchMs = Math.round(performance.now() - projectsStartedAt);
      const reposFetchMs = Math.round(performance.now() - reposStartedAt);

      const projectsJson = (await projectsRes.json()) as TududiOverview;
      const reposJson = (await reposRes.json()) as RepoListResponse & { error?: string };

      if (!projectsRes.ok && projectsRes.status !== 503) throw new Error(projectsJson.error || "Failed to load Tududi projects");
      if (!reposRes.ok) throw new Error(reposJson.error || "Failed to load repos");

      setProjectsData(projectsJson);
      setRepos(reposJson.repos || []);

      const targetUid = selectedProjectUid || projectsJson.projects?.[0]?.uid;
      if (!targetUid) {
        setSelectedData(null);
        setSelectedLoading(false);
        setError(null);
        setDebug({ projectsFetchMs, reposFetchMs, projectsReturned: projectsJson.projects?.length || 0, at: new Date().toISOString() });
        return;
      }

      const cached = selectedCacheRef.current[targetUid];
      if (cached) {
        setSelectedData(cached);
      } else {
        setSelectedData(null);
      }
      setSelectedLoading(true);

      const detailStop = startMeasure("mobile-v2.projects.detail", { targetUid, usedCache: Boolean(cached) });
      const detailStartedAt = performance.now();
      const selectedRes = await fetch(`/api/tududi?project_uid=${encodeURIComponent(targetUid)}`, { cache: "no-store" });
      const selectedJson = (await selectedRes.json()) as TududiOverview;
      const detailFetchMs = Math.round(performance.now() - detailStartedAt);
      detailStop({ tasksReturned: selectedJson.tasks?.length || 0 });
      if (!selectedRes.ok && selectedRes.status !== 503) throw new Error(selectedJson?.error || "Failed to load Tududi project detail");

      selectedCacheRef.current[targetUid] = selectedJson;
      setSelectedData(selectedJson);
      setDebug({
        targetUid,
        projectsFetchMs,
        reposFetchMs,
        detailFetchMs,
        usedCache: Boolean(cached),
        tasksReturned: selectedJson.tasks?.length || 0,
        projectsReturned: projectsJson.projects?.length || 0,
        selectedResolvedUid: selectedJson.selected_project?.uid,
        at: new Date().toISOString(),
      });
      setError(null);
      overviewStop({ targetUid, projectsReturned: projectsJson.projects?.length || 0, detailFetchMs });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      overviewStop({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
      setSelectedLoading(false);
    }
  }, [selectedProjectUid]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const linkedRepos = useMemo(() => resolveLinkedRepos(selectedData?.tasks || [], repos), [selectedData?.tasks, repos]);

  return { projectsData, selectedData, repos, linkedRepos, loading, selectedLoading, error, debug, refresh };
}
