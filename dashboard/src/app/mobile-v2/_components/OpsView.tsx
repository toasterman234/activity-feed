"use client";

import Link from "next/link";
import { Activity, Cpu, ExternalLink, RefreshCcw, ShieldCheck } from "lucide-react";
import { useV2Home } from "../_hooks/useV2Home";
import { formatRelative } from "./v2-utils";

export default function OpsView() {
  const { data, loading, error, refresh } = useV2Home();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--muted-foreground)]">Ops</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--foreground)]">Runtime + activity</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Overflow page for health, recent activity, and system links.</p>
        </div>
        <button onClick={() => void refresh()} className="v2-pill inline-flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)]">
          <RefreshCcw className="size-4" /> Refresh
        </button>
      </div>

      {error && <div className="v2-surface p-4 text-sm text-[var(--destructive)]">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[0.95fr,1.05fr]">
        <div className="space-y-4">
          <div className="v2-surface p-4">
            <div className="mb-3 flex items-center gap-2 text-[var(--foreground)]">
              <ShieldCheck className="size-4 text-[var(--primary)]" />
              <h3 className="text-base font-semibold">Runtime health</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="v2-soft p-3">
                <p className="font-medium text-[var(--foreground)]">Status</p>
                <p className="mt-1 text-[var(--muted-foreground)]">{data?.agents.runtimeOk ? "Runtime available" : data?.agents.runtimeError || "Unknown"}</p>
              </div>
              <div className="v2-soft p-3">
                <p className="font-medium text-[var(--foreground)]">Recovery hint</p>
                <p className="mt-1 text-[var(--muted-foreground)]">{data?.agents.recoveryHint || "No immediate action suggested."}</p>
              </div>
            </div>
          </div>

          <div className="v2-surface p-4">
            <div className="mb-3 flex items-center gap-2 text-[var(--foreground)]">
              <Cpu className="size-4 text-[var(--primary)]" />
              <h3 className="text-base font-semibold">System links</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["Full Channels", "/channels"],
                ["Projects", "/projects"],
                ["Runs", "/runs"],
                ["Settings", "/settings"],
                ["Ops", "/ops"],
                ["Perf", "/settings/perf"],
              ].map(([label, href]) => (
                <Link key={String(label)} href={String(href)} className="rounded-[1.1rem] border border-[var(--border)] bg-white p-3 text-sm font-medium text-[var(--foreground)]">
                  <div className="flex items-center justify-between gap-2"><span>{label}</span><ExternalLink className="size-4 text-[var(--primary)]" /></div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="v2-surface p-4">
          <div className="mb-3 flex items-center gap-2 text-[var(--foreground)]">
            <Activity className="size-4 text-[var(--primary)]" />
            <h3 className="text-base font-semibold">Recent activity</h3>
          </div>
          <div className="space-y-2.5">
            {(data?.recentHighlights || []).slice(0, 8).map((item) => (
              <div key={String(item.id)} className="rounded-[1.1rem] border border-[var(--border)] bg-[var(--muted)] p-3">
                <p className="text-sm font-medium text-[var(--foreground)]">{item.summary}</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.project || item.source} · {formatRelative(item.createdAt)}</p>
              </div>
            ))}
            {!loading && (data?.recentHighlights || []).length === 0 && <div className="rounded-[1.1rem] border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No recent highlights available.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
