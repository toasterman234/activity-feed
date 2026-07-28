"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Finding = { severity: string; message: string };
type InitiativeMapRow = {
  id: string;
  title: string;
  plan: string | null;
  planStatusLine: string | null;
  claimed: string;
  expectedStatus: string;
  ok: boolean;
  findings: Finding[];
};
type GraphInitiative = {
  id: string;
  evidence_map_id: string | null;
  title: string;
  status: string;
  plan_path: string | null;
  thread_id: string | null;
  channel_id: string | null;
  shipped_at: string | null;
  shipped_by: string | null;
};

type EvidencePayload = {
  generatedAt: string;
  evidence: { ok: boolean; failCount: number; warnCount: number; openCount?: number; results: InitiativeMapRow[] };
  inbox: { decisions: number; proposals: number; memory: number; error?: string };
  initiatives?: GraphInitiative[];
  summary: {
    mapInitiatives?: number;
    initiatives?: number;
    graphInitiatives?: number;
    failing: number;
    warnings: number;
    open?: number;
    pendingInbox: number;
    shipped?: number;
  };
  error?: string;
};

export default function EvidenceSettingsPage() {
  const [data, setData] = useState<EvidencePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const refresh = useCallback(async (sync = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/evidence${sync ? "?sync=1" : ""}`, { cache: "no-store" });
      const json = (await res.json()) as EvidencePayload;
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const promote = async (id: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/ops/initiatives/${id}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "you" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await refresh(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setActing(null);
    }
  };

  const mapCount = data?.summary.mapInitiatives ?? data?.summary.initiatives ?? data?.evidence.results.length ?? 0;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Evidence</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            PLAN proof + graph initiatives. Shipping requires the promote gate (evidence must pass).
          </p>
        </div>
        <button
          onClick={() => { void refresh(true); }}
          className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-[11px] font-medium dark:border-zinc-700"
        >
          Sync + refresh
        </button>
      </div>

      {loading && <p className="text-[11px] text-zinc-400">Checking…</p>}
      {error && <p className="text-[11px] text-amber-600 dark:text-amber-400">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-5 gap-1.5">
            <Stat label="Map" value={mapCount} />
            <Stat label="Fails" value={data.summary.failing} tone={data.summary.failing ? "danger" : "good"} />
            <Stat label="Open" value={data.summary.open || data.evidence.openCount || 0} tone={(data.summary.open || data.evidence.openCount) ? "warn" : "good"} />
            <Stat label="Shipped" value={data.summary.shipped || 0} tone="good" />
            <Link
              href="/channels/inbox"
              className={`rounded-lg border px-2 py-1.5 text-center ${
                data.summary.pendingInbox
                  ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  : "border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide opacity-70">Inbox</div>
              <div className="text-sm font-semibold">{data.summary.pendingInbox}</div>
            </Link>
          </div>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Graph initiatives</h3>
            {(data.initiatives || []).length === 0 ? (
              <p className="text-[11px] text-zinc-400">None yet — tap Sync + refresh to seed from the evidence map.</p>
            ) : (
              <ul className="space-y-2">
                {(data.initiatives || []).map((row) => (
                  <li key={row.id} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{row.title}</div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">{row.status}</span>
                          {row.evidence_map_id ? ` · map:${row.evidence_map_id}` : ""}
                          {row.plan_path ? ` · ${row.plan_path}` : ""}
                        </div>
                        {row.shipped_at && (
                          <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                            shipped {row.shipped_at.slice(0, 19)} by {row.shipped_by}
                          </p>
                        )}
                      </div>
                      {row.status !== "shipped" && (
                        <button
                          disabled={acting === row.id}
                          onClick={() => { void promote(row.id); }}
                          className="shrink-0 rounded-md bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                        >
                          {acting === row.id ? "…" : "Promote"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Evidence map</h3>
            <ul className="space-y-2">
              {data.evidence.results.map((row) => (
                <li key={row.id} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {row.ok ? "✓" : "✗"} {row.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    claimed <span className="font-medium text-zinc-700 dark:text-zinc-300">{row.claimed}</span>
                    {" · "}expected {row.expectedStatus}
                    {row.plan ? ` · ${row.plan}` : ""}
                  </div>
                  {row.findings.filter((f) => f.severity === "fail" || f.severity === "warn" || f.severity === "open").length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {row.findings
                        .filter((f) => f.severity === "fail" || f.severity === "warn" || f.severity === "open")
                        .map((f, i) => (
                          <li
                            key={`${row.id}-${i}`}
                            className={`text-[11px] ${
                              f.severity === "fail"
                                ? "text-red-600 dark:text-red-400"
                                : f.severity === "open"
                                  ? "text-sky-700 dark:text-sky-300"
                                  : "text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            [{f.severity}] {f.message}
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warn" | "danger" | "good";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
        : tone === "good"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
          : "border-zinc-200 dark:border-zinc-700";
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-center ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
