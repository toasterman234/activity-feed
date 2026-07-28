"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Finding = { severity: string; message: string };

type DetailPayload = {
  initiative: {
    id: string;
    evidence_map_id: string | null;
    title: string;
    status: string;
    plan_path: string | null;
    channel_id: string | null;
    thread_id: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
    shipped_at: string | null;
    shipped_by: string | null;
  };
  mapEntry: {
    id: string;
    title: string;
    plan?: string | null;
    expectedStatus?: string;
    requireAll?: string[];
    forbidAll?: string[];
    openItems?: Array<{ id?: string; title?: string; plan?: string; marker?: string }>;
  } | null;
  plan: {
    path: string;
    exists: boolean;
    statusLine: string | null;
    excerpt: string | null;
  } | null;
  check: {
    ok: boolean;
    claimed: string;
    expectedStatus: string;
    findings: Finding[];
  } | null;
  shipEvidence: Record<string, unknown> | null;
  blockers: number;
  links: {
    planPath: string | null;
    mapId: string | null;
    channelHref: string | null;
    threadHref: string | null;
  };
  timeline: Array<{ at: string; kind: string; actor: string; summary: string }>;
  error?: string;
};

function fmt(ts: string | null | undefined) {
  if (!ts) return "—";
  return ts.slice(0, 19).replace("T", " ");
}

export default function InitiativeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/initiatives/${id}`, { cache: "no-store" });
      const json = (await res.json()) as DetailPayload;
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const promote = async () => {
    if (!data) return;
    const title = data.initiative.title;
    const ok = window.confirm(
      `Promote “${title}” to shipped?\n\nOnly succeeds if evidence checks pass. Does not edit PLAN markdown.`,
    );
    if (!ok) return;
    setActing(true);
    try {
      const res = await fetch(`/api/ops/initiatives/${data.initiative.id}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "you" }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || json.reason || `HTTP ${res.status}`);
      }
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setActing(false);
    }
  };

  if (loading && !data) {
    return <p className="p-4 text-[11px] text-zinc-400">Loading initiative…</p>;
  }

  if (error && !data) {
    return (
      <div className="space-y-3 p-4">
        <Link href="/channels/continuity" className="text-[11px] text-zinc-500 underline">
          ← Initiatives
        </Link>
        <p className="text-[11px] text-amber-600">{error}</p>
      </div>
    );
  }

  if (!data) return null;
  const { initiative: init, mapEntry, plan, check, links, timeline, shipEvidence, blockers } = data;
  const canPromote = init.status !== "shipped" && (!check || check.ok) && blockers === 0;

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/channels/continuity" className="text-[11px] text-zinc-500 underline">
            ← Initiatives
          </Link>
          <h2 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">{init.title}</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Graph <span className="font-medium text-zinc-700 dark:text-zinc-300">{init.status}</span>
            {init.status !== "shipped" && (!check || check.ok) && blockers === 0 && (
              <span className="ml-1.5 inline-flex rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Ready to promote
              </span>
            )}
            {check ? (
              <>
                {" · "}checks {check.ok ? "pass" : "fail"} · PLAN claims{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{check.claimed}</span>
              </>
            ) : null}
          </p>
        </div>
        {init.status !== "shipped" && (
          <button
            disabled={acting || !canPromote}
            onClick={() => {
              void promote();
            }}
            className="shrink-0 rounded-md bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {acting ? "…" : "Promote to shipped"}
          </button>
        )}
      </div>

      {error && (
        <pre className="whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {error}
        </pre>
      )}

      {init.status !== "shipped" && check && !check.ok && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Do this now</p>
          <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">Evidence checks are failing.</p>
          <p className="mt-1 text-[12px] text-red-900/80 dark:text-red-100/80">
            <span className="font-semibold">Next:</span> Fix the findings below, then re-check / promote.
          </p>
        </div>
      )}

      {canPromote && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Do this now</p>
          <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Checks pass — admit this as shipped in the graph.
          </p>
          <p className="mt-1 text-[12px] text-amber-900/80 dark:text-amber-100/80">
            <span className="font-semibold">Next:</span> Tap <span className="font-semibold">Promote to shipped</span> above.
          </p>
        </div>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">What this is</h3>
        <dl className="mt-2 space-y-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
          <div>
            <dt className="inline text-zinc-400">Map id · </dt>
            <dd className="inline font-mono">{links.mapId || "—"}</dd>
          </div>
          <div>
            <dt className="inline text-zinc-400">Expected (checker) · </dt>
            <dd className="inline">{mapEntry?.expectedStatus || check?.expectedStatus || "—"}</dd>
          </div>
          <div>
            <dt className="inline text-zinc-400">Created · </dt>
            <dd className="inline">
              {fmt(init.created_at)} by {init.created_by}
            </dd>
          </div>
          <div>
            <dt className="inline text-zinc-400">Updated · </dt>
            <dd className="inline">{fmt(init.updated_at)}</dd>
          </div>
          {init.shipped_at && (
            <div>
              <dt className="inline text-zinc-400">Shipped · </dt>
              <dd className="inline">
                {fmt(init.shipped_at)} by {init.shipped_by}
              </dd>
            </div>
          )}
          {blockers > 0 && (
            <div className="text-amber-700 dark:text-amber-300">{blockers} active decision(s) blocking promote</div>
          )}
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Links back to</h3>
        <ul className="mt-2 space-y-1.5 text-[11px]">
          <li className="text-zinc-600 dark:text-zinc-300">
            Plan:{" "}
            <span className="font-mono text-zinc-800 dark:text-zinc-200">{links.planPath || "none"}</span>
            {plan && !plan.exists ? " (missing on disk)" : null}
          </li>
          {links.threadHref ? (
            <li>
              <Link href={links.threadHref} className="underline">
                Channel thread
              </Link>
            </li>
          ) : links.channelHref ? (
            <li>
              <Link href={links.channelHref} className="underline">
                Channel {init.channel_id}
              </Link>
            </li>
          ) : (
            <li className="text-zinc-400">No channel/thread linked (ops-level initiative)</li>
          )}
        </ul>
        {plan?.statusLine && (
          <p className="mt-2 text-[11px] text-zinc-500">Plan signal: {plan.statusLine}</p>
        )}
        {plan?.excerpt && (
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-zinc-50 p-2 text-[10px] leading-relaxed text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
            {plan.excerpt}
          </pre>
        )}
      </section>

      {(mapEntry?.requireAll?.length || mapEntry?.forbidAll?.length || mapEntry?.openItems?.length) && (
        <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Evidence contract
          </h3>
          {!!mapEntry?.requireAll?.length && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">Must exist</div>
              <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-zinc-600 dark:text-zinc-300">
                {mapEntry.requireAll.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {!!mapEntry?.forbidAll?.length && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">Must not exist yet</div>
              <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-zinc-600 dark:text-zinc-300">
                {mapEntry.forbidAll.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {!!mapEntry?.openItems?.length && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">Tracked open items</div>
              <ul className="mt-1 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                {mapEntry.openItems.map((item, i) => (
                  <li key={item.id || String(i)}>
                    {item.title || item.id || "open item"}
                    {item.plan ? <span className="text-zinc-400"> · {item.plan}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {check && (
        <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Live check {check.ok ? "✓" : "✗"}
          </h3>
          {check.findings.length === 0 ? (
            <p className="mt-2 text-[11px] text-zinc-400">No findings.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {check.findings.map((f, i) => (
                <li
                  key={i}
                  className={`text-[11px] ${
                    f.severity === "fail"
                      ? "text-red-600 dark:text-red-400"
                      : f.severity === "open"
                        ? "text-sky-700 dark:text-sky-300"
                        : f.severity === "warn"
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-zinc-500"
                  }`}
                >
                  [{f.severity}] {f.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {shipEvidence && (
        <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Ship evidence
          </h3>
          <pre className="mt-2 overflow-auto rounded-lg bg-zinc-50 p-2 text-[10px] text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
            {JSON.stringify(shipEvidence, null, 2)}
          </pre>
        </section>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Timeline</h3>
        {timeline.length === 0 ? (
          <p className="mt-2 text-[11px] text-zinc-400">No graph events yet for this initiative.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {timeline.map((item, i) => (
              <li key={`${item.at}-${i}`} className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
                <div className="text-[10px] text-zinc-400">{fmt(item.at)}</div>
                <div className="text-[11px] text-zinc-700 dark:text-zinc-200">{item.summary}</div>
                <div className="font-mono text-[10px] text-zinc-400">{item.kind}</div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
