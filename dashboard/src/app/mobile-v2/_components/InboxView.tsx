"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Archive, Clock3, Forward, MoreVertical, Reply, ReplyAll, Search, Trash2 } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useV2Inbox } from "../_hooks/useV2Inbox";
import { compactCount, formatRelative } from "./v2-utils";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DividedList, DividedRow } from "@/components/ui";

function shortChannelId(channelId: string) {
  if (channelId.length <= 14) return channelId;
  return `${channelId.slice(0, 8)}…`;
}

function channelLead(
  channel: {
    channelName: string;
    lastPulse: { snippet: string } | null;
    waitingPreview: Array<{ title: string }>;
  },
  detail?: {
    needsMe: Array<{ title: string }>;
    active: Array<{ title: string }>;
    threads: Array<{ title: string }>;
  },
) {
  return (
    detail?.needsMe?.[0]?.title ||
    channel.waitingPreview[0]?.title ||
    detail?.active?.[0]?.title ||
    detail?.threads?.[0]?.title ||
    channel.lastPulse?.snippet ||
    `Open ${channel.channelName}`
  );
}

export default function InboxView() {
  const { channels, channelDetails, summaryCounts, error, loading, refresh } = useV2Inbox();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("unread");
  const [tab, setTab] = useState("all");

  const filtered = useMemo(() => {
    let items = [...channels];
    const q = query.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (c) =>
          c.channelId.toLowerCase().includes(q) ||
          c.channelName.toLowerCase().includes(q) ||
          c.waitingPreview.some((item) => item.title.toLowerCase().includes(q)) ||
          c.lastPulse?.snippet?.toLowerCase().includes(q),
      );
    }
    if (tab === "unread") items = items.filter((c) => c.unreadCount > 0);
    if (tab === "waiting") items = items.filter((c) => c.states.wait > 0 || c.waitingPreview.length > 0);
    if (sort === "name") items.sort((a, b) => a.channelName.localeCompare(b.channelName) || a.channelId.localeCompare(b.channelId));
    else if (sort === "threads") items.sort((a, b) => b.threadCount - a.threadCount);
    else items.sort((a, b) => b.unreadCount - a.unreadCount || b.states.wait - a.states.wait || b.threadCount - a.threadCount);
    return items;
  }, [channels, query, sort, tab]);

  const preview = filtered[0] || null;
  const previewDetail = preview ? channelDetails.get(preview.channelId) : undefined;
  const mailboxes = [
    { label: "Channels", count: compactCount(channels.length) },
    { label: "Needs Review", count: compactCount(summaryCounts?.needsMe || 0) },
    { label: "Waiting", count: compactCount(channels.reduce((sum, channel) => sum + channel.states.wait, 0)) },
    { label: "Active", count: compactCount(summaryCounts?.active || 0) },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">Inbox</h2>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)] sm:text-sm">Channel-first queue view. Open a channel for full detail.</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => void refresh()}>Refresh</Button>
      </div>

      {error && <div className="v2-surface p-4 text-sm text-[var(--destructive)]">{error}</div>}

      <div className="md:hidden space-y-1.5">
        <div className="grid grid-cols-4 gap-1 text-center">
          {mailboxes.map((box) => (
            <div key={box.label} className="rounded-lg border border-[var(--border)] bg-white px-1 py-1">
              <div className="text-[8px] uppercase tracking-wide text-[var(--muted-foreground)]">{box.label}</div>
              <div className="mt-0.5 text-xs font-semibold text-[var(--foreground)]">{box.count}</div>
            </div>
          ))}
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger className="text-[11px]" value="all">All</TabsTrigger>
            <TabsTrigger className="text-[11px]" value="unread">New</TabsTrigger>
            <TabsTrigger className="text-[11px]" value="waiting">Wait</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid grid-cols-[1fr,96px] gap-1">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="pl-8 text-xs" />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unread">New</SelectItem>
              <SelectItem value="threads">Threads</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DividedList empty={!loading ? "No channels match the current filters." : undefined} className="rounded-xl">
          {filtered.map((channel) => {
            const detail = channelDetails.get(channel.channelId);
            const threadTitle = channelLead(channel, detail);
            const hasNew = channel.unreadCount > 0 || channel.waitingPreview.some((item) => item.reason === "unread");
            return (
              <DividedRow key={channel.channelId} href={`/mobile-v2/inbox/${channel.channelId}`} accent={hasNew ? "primary" : channel.states.wait > 0 ? "wait" : channel.states.active > 0 ? "active" : "neutral"} className="gap-2 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className={`truncate text-[12px] leading-4 text-[var(--foreground)] ${hasNew ? "font-semibold" : "font-medium"}`}>{channel.channelName}</p>
                        {channel.unreadCount > 0 ? <span className="inline-flex shrink-0 items-center rounded-full border border-[#d0d0d0] bg-[#ffffff] px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide text-[#000000]">{channel.unreadCount}</span> : null}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] leading-[1.3] text-[var(--foreground)]">{threadTitle}</p>
                    </div>
                    <div className="shrink-0 pt-0.5 text-[10px] text-[var(--muted-foreground)]">{formatRelative(channel.lastPulse?.createdAt || channel.waitingPreview[0]?.updatedAt)}</div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-[var(--muted-foreground)]">
                    <span>{channel.threadCount} threads</span>
                    {channel.states.wait > 0 ? <span>{channel.states.wait} wait</span> : null}
                    {channel.states.active > 0 ? <span>{channel.states.active} active</span> : null}
                    {channel.waitingPreview[0]?.reason === "unread" ? <span className="inline-flex items-center rounded-full border border-[#d0d0d0] bg-[#ffffff] px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide text-[#000000]">new</span> : null}
                  </div>
                </div>
              </DividedRow>
            );
          })}
        </DividedList>
      </div>

      <div className="hidden overflow-hidden rounded-[calc(var(--radius)*1.05)] border border-[var(--border)] bg-white md:block">
        <Group orientation="horizontal" className="min-h-[760px]">
          <Panel defaultSize={22} minSize={18} className="hidden md:block">
            <aside className="flex h-full flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
              <div className="border-b border-[var(--border)] p-4">
                <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white px-3 py-2.5">
                  <div>
                    <div className="text-sm font-semibold text-[var(--foreground)]">Ben</div>
                    <div className="text-xs text-[var(--muted-foreground)]">Queue mailbox</div>
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)]">⌄</div>
                </div>
              </div>
              <div className="space-y-1 p-2">
                {mailboxes.map((box, idx) => (
                    <div key={box.label} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm border ${idx === 0 ? "border-[var(--foreground)] bg-white text-[var(--foreground)]" : "border-transparent text-[var(--foreground)] hover:bg-white"}`}>
                    <span>{box.label}</span>
                    <span className={`text-xs ${idx === 0 ? "text-[var(--muted-foreground)]" : "text-[var(--muted-foreground)]"}`}>{box.count}</span>
                  </div>
                ))}
              </div>
            </aside>
          </Panel>
          <Separator className="hidden w-px bg-[var(--border)] md:block" />
          <Panel defaultSize={33} minSize={28}>
            <section className="flex h-full flex-col border-r border-[var(--border)]">
              <div className="border-b border-[var(--border)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <Tabs value={tab} onValueChange={setTab}>
                    <TabsList>
                      <TabsTrigger value="all">All mail</TabsTrigger>
                      <TabsTrigger value="unread">Unread</TabsTrigger>
                      <TabsTrigger value="waiting">Waiting</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unread">Sort by unread</SelectItem>
                      <SelectItem value="threads">Sort by threads</SelectItem>
                      <SelectItem value="name">Sort by name</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-3 relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search channels or threads" className="pl-9" />
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
                {filtered.map((channel) => {
                  const detail = channelDetails.get(channel.channelId);
                  return (
                    <Link key={channel.channelId} href={`/mobile-v2/inbox/${channel.channelId}`} className={`block rounded-2xl border p-3 ${preview?.channelId === channel.channelId ? "border-[var(--border)] bg-[#f6f6f7]" : "border-[var(--border)] bg-white"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-[var(--foreground)]">{channel.channelName}</p>
                            {channel.unreadCount > 0 && <span className="size-2 rounded-full bg-[var(--primary)]" />}
                          </div>
                          <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">#{shortChannelId(channel.channelId)}</p>
                          <p className="mt-1 truncate text-sm text-[var(--foreground)]">{channelLead(channel, detail)}</p>
                          <p className="mt-2 line-clamp-2 text-xs text-[var(--muted-foreground)]">{channel.lastPulse?.snippet || `${channel.threadCount} threads · ${channel.states.wait} waiting`}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                            {channel.waitingPreview.slice(0, 2).map((item) => <span key={item.threadId} className="rounded-md border border-[#d0d0d0] bg-[#ffffff] px-2 py-1 text-[#000000]">{item.reason}</span>)}
                            {channel.states.active > 0 && <span className="rounded-md border border-[#d0d0d0] bg-[#ffffff] px-2 py-1 text-[#000000]">active</span>}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs text-[var(--muted-foreground)]">{formatRelative(channel.lastPulse?.createdAt || channel.waitingPreview[0]?.updatedAt)}</div>
                      </div>
                    </Link>
                  );
                })}
                {!loading && filtered.length === 0 && <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No channels match the current filters.</div>}
              </div>
            </section>
          </Panel>
          <Separator className="w-px bg-[var(--border)]" />
          <Panel defaultSize={45} minSize={32}>
            <section className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon-sm"><Archive className="size-4" /></Button>
                  <Button variant="ghost" size="icon-sm"><Trash2 className="size-4" /></Button>
                  <Button variant="ghost" size="icon-sm"><Clock3 className="size-4" /></Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon-sm"><Reply className="size-4" /></Button>
                  <Button variant="ghost" size="icon-sm"><ReplyAll className="size-4" /></Button>
                  <Button variant="ghost" size="icon-sm"><Forward className="size-4" /></Button>
                  <Button variant="ghost" size="icon-sm"><MoreVertical className="size-4" /></Button>
                </div>
              </div>

              {preview ? (
                <>
                  <div className="border-b border-[var(--border)] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-[#f0f1f3] text-sm font-medium text-[var(--foreground)]">{preview.channelName.slice(0, 2).toUpperCase()}</div>
                        <div>
                          <div className="text-sm font-semibold text-[var(--foreground)]">{preview.channelName}</div>
                          <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">#{preview.channelId}</div>
                          <div className="mt-1 text-sm text-[var(--foreground)]">{channelLead(preview, previewDetail)}</div>
                          <div className="mt-1 text-xs text-[var(--muted-foreground)]">{preview.lastPulse?.author || "system"}</div>
                        </div>
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">{formatRelative(preview.lastPulse?.createdAt)}</div>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-5 overflow-auto px-4 py-4 text-[15px] leading-7 text-[var(--foreground)]">
                    <p>{preview.lastPulse?.snippet || "No recent pulse available for this channel."}</p>
                    <p>Unread: {preview.unreadCount}. Waiting threads: {preview.states.wait}. Active threads: {preview.states.active}. Use the dedicated detail page for tabs, queue breakdown, and related channel actions.</p>
                    <div className="rounded-xl border border-[var(--border)] bg-[#fafafa] p-4 text-sm text-[var(--muted-foreground)]">
                      <p className="font-medium text-[var(--foreground)]">Open dedicated detail page</p>
                      <p className="mt-1">This page mirrors the mail example layout. Clicking a row opens the separate mobile-v2 detail page you requested.</p>
                      <div className="mt-3">
                        <Link href={`/mobile-v2/inbox/${preview.channelId}`} className="inline-flex items-center rounded-md bg-[#111318] px-3 py-2 text-sm font-medium text-white">Open {preview.channelName}</Link>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-6 text-sm text-[var(--muted-foreground)]">Select a channel to preview it here.</div>
              )}
            </section>
          </Panel>
        </Group>
      </div>
    </div>
  );
}
