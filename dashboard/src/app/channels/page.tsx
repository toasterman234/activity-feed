"use client";

import { useEffect, useState } from "react";
import { getChannelShape, releaseChannelShape } from "./shapes";
import Link from "next/link";
import { ChannelsContent } from "./ChannelsContent";

export default function ChannelsPage() {
  const [channelShape, setChannelShape] = useState<ReturnType<typeof getChannelShape> extends Promise<infer T> ? T : never | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ok = true; setErr(null);
    const t = setTimeout(() => { if (ok) setErr("Timed out"); }, 12000);
    getChannelShape()
      .then((chs) => {
        if (!ok) return;
        clearTimeout(t);
        setChannelShape(chs);
      })
      .catch((e) => { if (ok) { clearTimeout(t); setErr(String(e)); } });
    return () => {
      ok = false;
      clearTimeout(t);
      releaseChannelShape();
    };
  }, []);

  if (!channelShape) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-zinc-400">{err || "Connecting…"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2">
          <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Channels</h1>
          <div className="flex items-center gap-3">
            <Link href="/channels/continuity" className="text-xs text-zinc-600 dark:text-zinc-300">Continuity</Link>
            <Link href="/projects" className="text-xs text-blue-600 dark:text-blue-400">Projects</Link>
          </div>
        </div>
      </header>
      <ChannelsContent channelShape={channelShape} />
    </div>
  );
}
