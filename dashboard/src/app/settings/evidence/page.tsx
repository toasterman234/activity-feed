"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  evidence: {
    ok: boolean;
    failCount: number;
    warnCount: number;
    openCount?: number;
    results: InitiativeMapRow[];
  };
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

type PromoteError = {
  error?: string;
  reason?: string;
  findings?: Finding[];
  blockers?: unknown;
};

export default function EvidenceSettingsPage() {
  const [data, setData] = useState<EvidencePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoteDetail, setPromoteDetail] = useState<string | null>(null);
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

  const promote = async (id: string, title: string) => {
    const ok = window.confirm(
      `Promote “${title}” to shipped?\n\n` +
        `This records an official ship in the graph. It only succeeds if the evidence-map checks for this initiative pass (and nothing is blocking it). It does not edit PLAN markdown.`,
    );
    if (!ok) return;

    setActing(id);
    setPromoteDetail(null);
    try {
      const res = await fetch(`/api/ops/initiatives/${id}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "you" }),
      });
      const json = (await res.json()) as PromoteError & { ok?: boolean };
      if (!res.ok || json.ok === false) {
        const findings = (json.findings || [])
          .map((f) => `[${f.severity}] ${f.message}`)
          .join("\n");
        throw new Error(
          [json.error || json.reason || `HTTP ${res.status}`, findings].filter(Boolean).join("\n"),
        );
      }
      setPromoteDetail(`Promoted “${title}” to shipped.`);
      await refresh(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setActing(null);
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const byMapId = new Map(data.evidence.results.map((r) => [r.id, r]));
    const initiatives = data.initiatives || [];
    const used = new Set<string>();

    const joined = initiatives.map((init) => {
      const map = init.evidence_map_id ? byMapId.get(init.evidence_map_id) : undefined;
      if (map) used.add(map.id);
      return { init, map };
    });

    for (const map of data.evidence.results) {
      if (used.has(map.id)) continue;
      joined.push({
        init: null,
        map,
      });
    }
    return joined;
  }, [data]);

  const mapCount = data?.summary.mapInitiatives ?? data?.summary.initiatives ?? data?.evidence.results.length ?? 0;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Evidence</h2>
          <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Each card is a tracked initiative — tap the title for plan links, required files, findings, and timeline.
            <span className="font-medium text-zinc-700 dark:text-zinc-300"> Promote </span>
            means “admit this as officially shipped in the graph” — only if checks pass. It does not rewrite PLAN files.
          </p>
        </div>
        <button
          onClick={() => {
            void refresh(true);
          }}
          className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-[11px] font-medium dark:border-zinc-700"
        >
          Sync + refresh
        </button>
      </div>

      {loading && <p className="text-[11px] text-zinc-400">Checking…</p>}
      {error && (
        <pre className="whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {error}
        </pre>
      )}
      {promoteDetail && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-300">{promoteDetail}</p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-5 gap-1.5">
            <Stat label="Tracked" value={mapCount} />
            <Stat label="Fails" value={data.summary.failing} tone={data.summary.failing ? "danger" : "good"} />
            <Stat
              label="Open"
              value={data.summary.open || data.evidence.openCount || 0}
              tone={data.summary.open || data.evidence.openCount ? "warn" : "good"}
            />
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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Initiatives</h3>
            {rows.length === 0 ? (
              <p className="text-[11px] text-zinc-400">
                None yet — tap Sync + refresh to seed from the evidence map.
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map(({ init, map }) => {
                  const title = init?.title || map?.title || "Untitled";
                  const key = init?.id || map?.id || title;
                  const gateOk = map ? map.ok : true;
                  const openFindings = (map?.findings || []).filter(
                    (f) => f.severity === "fail" || f.severity === "warn" || f.severity === "open",
                  );
                  const canPromote = Boolean(init && init.status !== "shipped" && gateOk);
                  const blockedReason = !init
                    ? "Not in graph yet — Sync + refresh"
                    : init.status === "shipped"
                      ? null
                      : !gateOk
                        ? "Evidence checks failing — fix findings first"
                        : null;

                  return (
                    <li
                      key={key}
                      className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {gateOk ? "✓" : "✗"}{" "}
                            {init ? (
                              <Link href={`/settings/evidence/${init.id}`} className="underline-offset-2 hover:underline">
                                {title}
                              </Link>
                            ) : (
                              title
                            )}
                          </div>
                          {init && (
                            <Link
                              href={`/settings/evidence/${init.id}`}
                              className="mt-0.5 inline-block text-[10px] text-zinc-400 underline"
                            >
                              Open details →
                            </Link>
                          )}
                          <div className="mt-0.5 space-y-0.5 text-[11px] text-zinc-500">
                            <div>
                              Graph:{" "}
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                {init?.status || "not synced"}
                              </span>
                              {map ? (
                                <>
                                  {" · "}PLAN claims{" "}
                                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                    {map.claimed}
                                  </span>
                                  {" · "}checker expects {map.expectedStatus}
                                </>
                              ) : null}
                            </div>
                            {(init?.plan_path || map?.plan) && (
                              <div className="truncate">Plan: {init?.plan_path || map?.plan}</div>
                            )}
                            {init?.evidence_map_id && (
                              <div className="truncate text-zinc-400">map id: {init.evidence_map_id}</div>
                            )}
                          </div>
                          {init?.shipped_at && (
                            <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                              Shipped {init.shipped_at.slice(0, 19).replace("T", " ")} by {init.shipped_by}
                            </p>
                          )}
                        </div>
                        {init && init.status !== "shipped" && (
                          <button
                            disabled={acting === init.id || !canPromote}
                            title={
                              canPromote
                                ? "Mark officially shipped in the graph (evidence must pass)"
                                : blockedReason || "Cannot promote"
                            }
                            onClick={() => {
                              void promote(init.id, title);
                            }}
                            className="shrink-0 rounded-md bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                          >
                            {acting === init.id ? "…" : "Promote to shipped"}
                          </button>
                        )}
                      </div>

                      {blockedReason && init?.status !== "shipped" && (
                        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">{blockedReason}</p>
                      )}

                      {openFindings.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                          {openFindings.map((f, i) => (
                            <li
                              key={`${key}-f-${i}`}
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

                      {init?.status !== "shipped" && gateOk && openFindings.length === 0 && map && (
                        <p className="mt-2 text-[11px] text-zinc-400">
                          Checks pass. Promote records ship in the graph; PLAN markdown stays as-is.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
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
