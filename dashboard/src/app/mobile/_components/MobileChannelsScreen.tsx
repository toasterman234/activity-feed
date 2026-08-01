"use client";

import Link from "next/link";
import { useMobileChannels } from "../_hooks/useMobileChannels";
import { formatRelative } from "./mobile-utils";

export default function MobileChannelsScreen() {
  const { channels, loading, error, refresh } = useMobileChannels();

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 pt-1">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">Inbox</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Channels</h1>
        </div>
        <button onClick={() => void refresh()} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300">Refresh</button>
      </div>

      {error && <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</div>}

      <div className="space-y-3">
        {channels.map((channel) => (
          <Link key={channel.channelId} href={`/channels/${channel.channelId}`} className="block rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-medium">#{channel.channelId}</h2>
                <p className="mt-1 text-xs text-zinc-400">{channel.threadCount} threads · {channel.states.active} active · {channel.states.wait} waiting</p>
              </div>
              <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-[10px] font-medium text-cyan-200">{channel.unreadCount} unread</span>
            </div>

            {channel.lastPulse && <p className="mt-3 line-clamp-2 text-sm text-zinc-300">{channel.lastPulse.author}: {channel.lastPulse.snippet}</p>}

            {channel.waitingPreview.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {channel.waitingPreview.map((item) => (
                  <span key={item.threadId} className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] text-zinc-300">
                    {item.reason} · {formatRelative(item.updatedAt)}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
        {!loading && channels.length === 0 && <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 text-sm text-zinc-400">No channels available.</div>}
      </div>
    </div>
  );
}
