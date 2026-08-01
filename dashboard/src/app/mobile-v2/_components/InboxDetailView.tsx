"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, RefreshCcw } from "lucide-react";
import { useMemo } from "react";
import { useV2Inbox } from "../_hooks/useV2Inbox";
import { useV2ChannelDetail, type V2ChannelThread } from "../_hooks/useV2ChannelDetail";
import { formatRelative } from "./v2-utils";
import { Button } from "@/components/ui/button";
import { DividedList, DividedRow, Tabs, TabsContent, TabsList, TabsTrigger, type UiTone } from "@/components/ui";

function toneForThread(thread: V2ChannelThread): UiTone {
  const state = (thread.state || "").toLowerCase();
  if (thread.hasUnread) return "primary";
  if (["wait", "review", "blocked"].includes(state)) return "wait";
  if (["active", "running", "in_progress"].includes(state)) return "active";
  if (["open", "triaged", "start"].includes(state)) return "open";
  return "neutral";
}

function subtitleForThread(thread: V2ChannelThread) {
  if (thread.hasUnread) return `${thread.unreadReplyCount} new response${thread.unreadReplyCount === 1 ? "" : "s"}`;
  if (thread.lastAuthor) return `${thread.lastAuthor} · ${formatRelative(thread.lastMessageAt || thread.updatedAt)}`;
  return "Thread";
}

function ThreadRow({ channelId, thread }: { channelId: string; thread: V2ChannelThread }) {
  return (
    <DividedRow href={`/mobile-v2/inbox/${channelId}/${thread.threadId}`} accent={toneForThread(thread)} className="gap-2 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className={`truncate text-[12px] leading-4 text-[var(--foreground)] ${thread.hasUnread ? "font-semibold" : "font-medium"}`}>{thread.title}</p>
              {thread.hasUnread ? <span className="inline-flex shrink-0 items-center rounded-full border border-[#d0d0d0] bg-[#ffffff] px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide text-[#000000]">new</span> : null}
            </div>
            <p className="mt-0.5 truncate text-[10px] text-[var(--muted-foreground)]">{subtitleForThread(thread)}</p>
          </div>
          <div className="shrink-0 pt-0.5 text-[10px] text-[var(--muted-foreground)]">{formatRelative(thread.lastMessageAt || thread.updatedAt)}</div>
        </div>
        {thread.lastSnippet ? <p className="mt-0.5 line-clamp-1 text-[11px] leading-[1.3] text-[var(--foreground)]">{thread.lastSnippet}</p> : null}
        <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-[var(--muted-foreground)]">
          {thread.state ? <span className="inline-flex items-center rounded-full border border-[#d0d0d0] bg-[#ffffff] px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide text-[#000000]">{thread.state}</span> : null}
          <span>{thread.replyCount} replies</span>
          {thread.lifecycle ? <span>{thread.lifecycle}</span> : null}
          {thread.repoName ? <span className="truncate">{thread.repoName}</span> : null}
        </div>
      </div>
    </DividedRow>
  );
}

export default function InboxDetailView({ channelId }: { channelId: string }) {
  const { channels, error: inboxError, refresh: refreshInbox } = useV2Inbox();
  const { data, loading, error: channelError, refresh } = useV2ChannelDetail(channelId);
  const selected = useMemo(() => channels.find((c) => c.channelId === channelId) || null, [channels, channelId]);

  const groups = useMemo(() => {
    const rows = [...(data?.threads || [])].sort((a, b) => {
      if (!!a.archivedAt !== !!b.archivedAt) return a.archivedAt ? 1 : -1;
      if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
      if (a.unreadReplyCount !== b.unreadReplyCount) return b.unreadReplyCount - a.unreadReplyCount;
      const aTime = Date.parse(a.lastMessageAt || a.updatedAt || "1970-01-01");
      const bTime = Date.parse(b.lastMessageAt || b.updatedAt || "1970-01-01");
      return bTime - aTime;
    });

    return {
      all: rows.filter((row) => !row.archivedAt),
      newResponses: rows.filter((row) => !row.archivedAt && row.hasUnread),
      waiting: rows.filter((row) => !row.archivedAt && ["wait", "review", "blocked"].includes((row.state || "").toLowerCase())),
      archived: rows.filter((row) => !!row.archivedAt),
    };
  }, [data?.threads]);

  const headline = data?.channel.name || selected?.channelName || channelId;
  const unreadThreads = groups.newResponses.length;
  const summary = [
    { label: "new", value: unreadThreads },
    { label: "threads", value: selected?.threadCount || groups.all.length },
    { label: "wait", value: groups.waiting.length },
    { label: "unread", value: selected?.unreadCount || 0 },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href="/mobile-v2/inbox" className="inline-flex items-center gap-1.5 text-[11px] text-[var(--primary)]"><ArrowLeft className="size-3.5" /> Inbox</Link>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-base font-semibold tracking-tight text-[var(--foreground)]">#{headline}</h2>
            {unreadThreads > 0 ? <span className="inline-flex items-center rounded-full border border-[#d0d0d0] bg-[#ffffff] px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide text-[#000000]">{unreadThreads} new</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => void Promise.all([refreshInbox(), refresh()])}>
            <RefreshCcw className="size-3.5" />
          </Button>
          <Link href={`/channels/${channelId}`} className="inline-flex h-8 items-center rounded-md border border-[var(--border)] bg-white px-2 text-[11px] font-medium text-[var(--foreground)]">
            Prod <ExternalLink className="ml-1 size-3 text-[var(--primary)]" />
          </Link>
        </div>
      </div>

      {(inboxError || channelError) ? <div className="v2-surface p-3 text-sm text-[var(--destructive)]">{inboxError || channelError}</div> : null}

      <div className="grid grid-cols-4 gap-1 text-center">
        {summary.map((item) => (
          <div key={item.label} className="rounded-lg border border-[var(--border)] bg-white px-1 py-1">
            <div className="text-[8px] uppercase tracking-wide text-[var(--muted-foreground)]">{item.label}</div>
            <div className="mt-0.5 text-xs font-semibold text-[var(--foreground)]">{item.value}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="all" className="overflow-x-hidden">
        <TabsList className="grid w-full grid-cols-4 gap-0.5 overflow-hidden rounded-md p-[2px]">
          <TabsTrigger className="text-[10px]" value="all">All</TabsTrigger>
          <TabsTrigger className="text-[10px]" value="new">New</TabsTrigger>
          <TabsTrigger className="text-[10px]" value="waiting">Wait</TabsTrigger>
          <TabsTrigger className="text-[10px]" value="archived">Arch</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-1">
          <DividedList empty={!loading ? "No live threads." : undefined} className="rounded-xl">
            {groups.all.map((thread) => <ThreadRow key={thread.threadId} channelId={channelId} thread={thread} />)}
          </DividedList>
        </TabsContent>

        <TabsContent value="new" className="mt-1">
          <DividedList empty={!loading ? "No new responses." : undefined} className="rounded-xl">
            {groups.newResponses.map((thread) => <ThreadRow key={thread.threadId} channelId={channelId} thread={thread} />)}
          </DividedList>
        </TabsContent>

        <TabsContent value="waiting" className="mt-1">
          <DividedList empty={!loading ? "No waiting threads." : undefined} className="rounded-xl">
            {groups.waiting.map((thread) => <ThreadRow key={thread.threadId} channelId={channelId} thread={thread} />)}
          </DividedList>
        </TabsContent>

        <TabsContent value="archived" className="mt-1">
          <DividedList empty={!loading ? "No archived threads." : undefined} className="rounded-xl">
            {groups.archived.map((thread) => <ThreadRow key={thread.threadId} channelId={channelId} thread={thread} />)}
          </DividedList>
        </TabsContent>
      </Tabs>
    </div>
  );
}
