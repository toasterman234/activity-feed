"use client";

import { useCallback, useEffect, useState } from "react";

interface OverviewData {
  generatedAt: string;
  totals: Array<{ source: string; count: number }>;
  bySourceOutcome: Record<string, Record<string, number>>;
  weeklyTrends: Record<string, Array<{ week: string; total: number; successRate: number; driftRate: number }>>;
  topFailing: Array<{ project: string; total: number; success: number; fail: number }>;
  byAgent: Array<{ agentId: string; source: string; total: number; success: number; fail: number; drift: number }>;
  judged: { bySource: Record<string, number>; total: number };
  error?: string;
}

interface RunRow {
  id: string;
  source: string;
  agent_id: string | null;
  project: string | null;
  operation: string | null;
  started_at: string | null;
  duration_ms: number | null;
  outcome: string;
  outcome_source: string;
  drifted: boolean;
  dead_end: boolean;
  headline: string | null;
  summary: string | null;
}

const OUTCOME_ORDER: Record<string, number> = { success: 0, drifted: 1, failed: 2, dead_end: 3, unknown: 4 };

export function useV2Runs() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewErr, setOverviewErr] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsErr, setRunsErr] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [outcome, setOutcome] = useState("");
  const [project, setProject] = useState("");
  const [offset, setOffset] = useState(0);

  const fetchOverview = useCallback(async () => {
    try {
      const r = await fetch("/api/agent-runs/overview", { cache: "no-store" });
      if (r.ok) {
        setOverview(await r.json());
        setOverviewErr(null);
      } else {
        setOverviewErr(`HTTP ${r.status}`);
      }
    } catch (e) {
      setOverviewErr(String(e));
    }
  }, []);

  const fetchRuns = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "30", offset: String(offset) });
      if (source) params.set("source", source);
      if (outcome) params.set("outcome", outcome);
      if (project.trim()) params.set("project", project.trim());
      const r = await fetch(`/api/agent-runs/list?${params}`, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        // Sort: success first, then drifted, then failed, then dead_end, then unknown
        const sorted = [...(data.rows || [])].sort(
          (a: RunRow, b: RunRow) => (OUTCOME_ORDER[a.outcome] ?? 5) - (OUTCOME_ORDER[b.outcome] ?? 5)
        );
        setRuns(sorted);
        setRunsTotal(data.total);
        setRunsErr(null);
      } else {
        setRunsErr(`HTTP ${r.status}`);
      }
    } catch (e) {
      setRunsErr(String(e));
    }
  }, [source, outcome, project, offset]);

  useEffect(() => { void fetchOverview(); }, [fetchOverview]);
  useEffect(() => { void fetchRuns(); }, [fetchRuns]);

  const setFilter = (key: "source" | "outcome" | "project", value: string) => {
    setOffset(0);
    if (key === "source") setSource(value);
    if (key === "outcome") setOutcome(value);
    if (key === "project") setProject(value);
  };

  return {
    overview,
    overviewErr,
    runs,
    runsTotal,
    runsErr,
    source,
    outcome,
    project,
    offset,
    setFilter,
    setOffset,
    fetchOverview,
    fetchRuns,
  };
}

export function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function fmtDuration(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function fmtDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const OUTCOME_BADGE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  drifted: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  dead_end: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  unknown: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

export const OUTCOME_LABEL: Record<string, string> = {
  success: "OK",
  drifted: "DRIFT",
  failed: "FAIL",
  dead_end: "DEAD",
  unknown: "?",
};

export const SOURCE_COLORS: Record<string, string> = {
  "claude-code": "bg-purple-100 text-purple-700",
  pi: "bg-green-100 text-green-700",
  omp: "bg-blue-100 text-blue-700",
  codex: "bg-pink-100 text-pink-700",
  cursor: "bg-cyan-100 text-cyan-700",
  "open-webui": "bg-violet-100 text-violet-700",
};

export const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "CC",
  pi: "PI",
  omp: "OMP",
  codex: "CDX",
  cursor: "CSR",
  "open-webui": "OWU",
};
