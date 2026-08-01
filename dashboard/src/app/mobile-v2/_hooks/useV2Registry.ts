"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RegistryKind, RegistryRecord, RegistrySnapshot } from "@/lib/registry";

const KIND_ORDER: RegistryKind[] = [
  "Agent", "Skill", "Tool", "Toolset", "Model",
  "Workflow", "Lifecycle", "Policy", "Runtime", "Service",
];

export function useV2Registry() {
  const [data, setData] = useState<RegistrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [kind, setKind] = useState<RegistryKind | "All">("All");

  const fetchData = useCallback(async (q: string, k: string) => {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (k && k !== "All") params.set("kind", k);
      const r = await fetch(`/api/registry?${params}`, { cache: "no-store" });
      if (r.ok) {
        setData(await r.json());
        setError(null);
      } else {
        setError(`HTTP ${r.status}`);
      }
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void fetchData(submittedQuery, kind);
  }, [submittedQuery, kind, fetchData]);

  const counts = useMemo(() => {
    const m = new Map<RegistryKind, number>();
    for (const r of data?.records || []) m.set(r.kind, (m.get(r.kind) || 0) + 1);
    return m;
  }, [data]);

  const visible = useMemo(() => {
    const records = data?.records || [];
    if (kind === "Agent") return records.filter((r) => r.kind === "Agent").slice(0, 40);
    if (kind === "All") return records.slice(0, 100);
    return records.filter((r) => r.kind === kind).slice(0, 100);
  }, [data, kind]);

  const submitSearch = (q: string) => {
    setSubmittedQuery(q.trim());
    setKind("All");
  };

  const selectKind = (k: RegistryKind | "All") => {
    setKind(k);
    setSubmittedQuery("");
  };

  return {
    data,
    error,
    query,
    setQuery,
    submittedQuery,
    kind,
    counts,
    visible,
    submitSearch,
    selectKind,
  };
}
