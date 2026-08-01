"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, FolderKanban, Inbox, RefreshCcw, Wrench } from "lucide-react";
import { useV2Home } from "../_hooks/useV2Home";
import { compactCount, formatRelative, statusTone } from "./v2-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

function SignalRow({ title, meta, state, href }: { title: string; meta: string; state: string; href: string }) {
  return (
    <Link href={href} className="flex items-start justify-between gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--foreground)]">{title}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">{meta}</p>
      </div>
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusTone(state)}`}>{state}</span>
    </Link>
  );
}

export default function TodayView() {
  const { data, loading, error, refresh } = useV2Home();

  const stats = [
    ["Unread", data?.summaryCounts.unread || 0],
    ["Needs", data?.summaryCounts.needsMe || 0],
    ["Active", data?.summaryCounts.active || 0],
    ["Failed", data?.summaryCounts.failed || 0],
  ] as const;

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Today</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">Command center</h2>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)] sm:text-sm">Signals first. Details on demand.</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => void refresh()}>
          <RefreshCcw className="size-4" />
        </Button>
      </div>

      {error && <div className="v2-surface p-3 text-sm text-[var(--destructive)]">{error}</div>}

      <Card size="sm" className="v2-surface py-2.5">
        <CardContent className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-center">
                <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{label}</div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-[var(--foreground)]">{compactCount(Number(value))}</div>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-white px-3 py-3">
            <div className="rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,white)] p-2 text-[var(--primary)]">
              <AlertTriangle className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Primary focus</div>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--foreground)]">{data?.topNeedsMe?.[0]?.title || "No urgent queue item right now"}</p>
              <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{data?.topNeedsMe?.[0] ? `#${data.topNeedsMe[0].channelName} · ${data.topNeedsMe[0].reason}` : "Queue is clear at the moment."}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Accordion defaultValue={["urgent"]} className="v2-surface rounded-[calc(var(--radius)*1.05)] border border-[var(--border)] bg-[var(--card)] px-3 py-1" multiple>
        <AccordionItem value="urgent">
          <AccordionTrigger className="py-2.5 no-underline hover:no-underline">
            <div>
              <div className="text-sm font-semibold text-[var(--foreground)]">Urgent queue</div>
              <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{(data?.topNeedsMe || []).length} visible</div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-2">
            {(data?.topNeedsMe || []).slice(0, 3).map((item) => (
              <SignalRow key={item.threadId} href={`/channels/${item.channelId}/${item.threadId}`} title={item.title} meta={`#${item.channelName} · ${item.why || item.reason}`} state={item.state} />
            ))}
            {!loading && (data?.topNeedsMe || []).length === 0 && <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-sm text-[var(--muted-foreground)]">No urgent queue items.</div>}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="active">
          <AccordionTrigger className="py-2.5 no-underline hover:no-underline">
            <div>
              <div className="text-sm font-semibold text-[var(--foreground)]">Active work</div>
              <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{(data?.topActive || []).length} visible</div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-2">
            {(data?.topActive || []).slice(0, 3).map((item) => (
              <SignalRow key={item.threadId} href={`/channels/${item.channelId}/${item.threadId}`} title={item.title} meta={`#${item.channelName} · ${item.latestStep?.label || item.lifecycle} · ${formatRelative(item.latestStep?.createdAt)}`} state={item.state} />
            ))}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="channels">
          <AccordionTrigger className="py-2.5 no-underline hover:no-underline">
            <div>
              <div className="text-sm font-semibold text-[var(--foreground)]">Unread channels</div>
              <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{(data?.topUnread || []).length} visible</div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-2">
            {(data?.topUnread || []).slice(0, 3).map((item) => (
              <Link key={item.channelId} href={`/mobile-v2/inbox/${item.channelId}`} className="flex items-start justify-between gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--foreground)]">#{item.channelName}</p>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">{item.lastPulse?.snippet || "No recent pulse"}</p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">{item.unreadCount}</span>
              </Link>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="grid grid-cols-2 gap-2">
        {[
          ["Inbox", "/mobile-v2/inbox", Inbox],
          ["Projects", "/mobile-v2/projects", FolderKanban],
          ["Ops", "/mobile-v2/ops", Wrench],
          ["Channels", "/channels", ArrowRight],
        ].map(([label, href, Icon]) => (
          <Link key={String(label)} href={String(href)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-medium text-[var(--foreground)]">
            <div className="flex items-center gap-2"><Icon className="size-4 text-[var(--primary)]" /> {label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
