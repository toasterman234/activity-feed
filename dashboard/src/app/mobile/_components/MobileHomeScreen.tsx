"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useMobileHome } from "../_hooks/useMobileHome";
import { compactCount, formatRelative } from "./mobile-utils";

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] ${className}`}>{children}</section>;
}

export default function MobileHomeScreen() {
  const { data, loading, error, refresh } = useMobileHome();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 pt-1">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">Mobile app</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-zinc-400">Separate mobile surface. Same backend.</p>
        </div>
        <button onClick={() => void refresh()} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300">
          Refresh
        </button>
      </div>

      {error && <Panel className="text-sm text-rose-200">{error}</Panel>}

      <Panel>
        <div className="grid grid-cols-4 gap-2">
          {[
            ["Unread", data?.summaryCounts.unread || 0],
            ["Needs", data?.summaryCounts.needsMe || 0],
            ["Active", data?.summaryCounts.active || 0],
            ["Fail", data?.summaryCounts.failed || 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
              <div className="mt-1 text-xl font-semibold">{compactCount(Number(value))}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-200">Needs you</h2>
          <Link href="/mobile/channels" className="text-xs text-cyan-300">Open channels</Link>
        </div>
        <div className="space-y-2">
          {(data?.topNeedsMe || []).slice(0, 4).map((item) => (
            <Link key={item.threadId} href={`/channels/${item.channelId}/${item.threadId}`} className="block rounded-2xl border border-white/8 bg-black/15 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="line-clamp-1 text-sm font-medium text-zinc-100">{item.title}</p>
                <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">{item.state}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">#{item.channelName} · {item.why || item.reason}</p>
            </Link>
          ))}
          {!loading && (data?.topNeedsMe || []).length === 0 && <p className="text-sm text-zinc-400">No urgent threads right now.</p>}
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-200">Active work</h2>
          <Link href="/mobile/projects" className="text-xs text-cyan-300">Projects</Link>
        </div>
        <div className="space-y-2">
          {(data?.topActive || []).slice(0, 4).map((item) => (
            <Link key={item.threadId} href={`/channels/${item.channelId}/${item.threadId}`} className="block rounded-2xl bg-black/15 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                <span className="text-[10px] uppercase tracking-wide text-emerald-300">{item.state}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">#{item.channelName} · {item.latestStep?.label || item.lifecycle}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{formatRelative(item.latestStep?.createdAt)}</p>
            </Link>
          ))}
          {!loading && (data?.topActive || []).length === 0 && <p className="text-sm text-zinc-400">No active work detected.</p>}
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-200">Unread channels</h2>
          <span className="text-[11px] text-zinc-500">{formatRelative(data?.generatedAt)}</span>
        </div>
        <div className="space-y-2">
          {(data?.topUnread || []).slice(0, 5).map((item) => (
            <Link key={item.channelId} href={`/channels/${item.channelId}`} className="block rounded-2xl border border-white/8 bg-black/15 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">#{item.channelName}</p>
                <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] text-cyan-200">{item.unreadCount} unread</span>
              </div>
              <p className="mt-1 line-clamp-1 text-xs text-zinc-400">{item.lastPulse?.snippet || "No recent pulse"}</p>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
