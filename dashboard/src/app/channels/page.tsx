"use client";

import { useEffect, useState } from "react";
import { getChannelShape, releaseChannelShape } from "./shapes";
import Link from "next/link";
import { ChannelsContent } from "./ChannelsContent";
import { PageShell } from "@/components/ui";

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
      <div className="min-h-screen bg-background flex items-center justify-center pb-16">
        <p className="text-sm text-muted-foreground animate-pulse">{err || "Connecting…"}</p>
      </div>
    );
  }

  return (
    <PageShell maxWidth="max-w-5xl" className="pb-4">
      {/* Header (proto-5 style) */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Channels</h1>
        <Link href="/projects" className="text-xs font-medium text-primary hover:underline">
          Projects
        </Link>
      </div>
      <ChannelsContent channelShape={channelShape} />
    </PageShell>
  );
}
