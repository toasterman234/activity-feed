"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Finding = { severity: string; message: string };
type Initiative = {
  id: string;
  title: string;
  plan: string | null;
  planStatusLine: string | null;
  claimed: string;
  expectedStatus: string;
  ok: boolean;
  findings: Finding[];
};

type EvidencePayload = {
  generatedAt: string;
  evidence: { ok: boolean; failCount: number; warnCount: number; results: Initiative[] };
  inbox: { decisions: number; proposals: number; memory: number; error?: string };
  summary: { initiatives: number; failing: number; warnings: number; pendingInbox: number };
  error?: string;
};

export default function EvidenceSettingsPage() {
  const [data, setData] = useState<EvidencePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/evidence", { cache: "no-store" });
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
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Evidence</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            PLAN claims vs filesystem proof. Graph Inbox remains the human gate for decisions/proposals.
          </p>
        </div>
        <button
          onClick={() => { void refresh(); }}
          className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-[11px] font-medium dark:border-zinc-700"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="text-[11px] text-zinc-400">Checking…</p>}
      {error && <p className="text-[11px] text-amber-600 dark:text-amber-400">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            <Stat label="Initiatives" value={data.summary.initiatives} />
            <Stat label="Fails" value={data.summary.failing} tone={data.summary.failing ? "danger" : "good"} />
            <Stat label="Warns" value={data.summary.warnings} tone={data.summary.warnings ? "warn" : "good"} />
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

          <ul className="space-y-2">
            {data.evidence.results.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {row.ok ? "✓" : "✗"} {row.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      claimed <span className="font-medium text-zinc-700 dark:text-zinc-300">{row.claimed}</span>
                      {" · "}expected {row.expectedStatus}
                      {row.plan ? ` · ${row.plan}` : ""}
                    </div>
                  </div>
                </div>
                {row.planStatusLine && (
                  <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">{row.planStatusLine}</p>
                )}
                {row.findings.filter((f) => f.severity !== "info").length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {row.findings
                      .filter((f) => f.severity !== "info")
                      .map((f, i) => (
                        <li
                          key={`${row.id}-${i}`}
                          className={`text-[11px] ${
                            f.severity === "fail"
                              ? "text-red-600 dark:text-red-400"
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
