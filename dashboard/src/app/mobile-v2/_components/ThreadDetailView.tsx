"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowUpIcon, ExternalLink, FolderKanban, RefreshCcw } from "lucide-react";
import { useV2Thread } from "../_hooks/useV2Thread";
import { formatRelative, statusTone } from "./v2-utils";
import { parseMentions } from "@/lib/mentions";
import { writeChannelRow } from "@/app/writeChannelRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupButton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { ThreadChatTranscript } from "@/app/channels/ThreadChatTranscript";
import { useLiveThreadMessages } from "@/app/channels/useLiveThreadMessages";

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export default function ThreadDetailView({ channelId, threadId }: { channelId: string; threadId: string }) {
  const { detail, extras, loading, error, refresh } = useV2Thread(channelId, threadId);
  const live = useLiveThreadMessages(channelId, threadId);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  const rootMessage = live.threadMsg
    ? {
        id: live.threadMsg.id,
        author: live.threadMsg.author,
        body: live.threadMsg.body,
        createdAt: live.threadMsg.created_at,
      }
    : detail
      ? {
          id: detail.thread.threadId,
          author: detail.thread.rootAuthor,
          body: detail.thread.rootBody,
          createdAt: detail.thread.createdAt,
        }
      : null;

  const replies = live.replies.length > 0
    ? live.replies.map((reply) => ({
        id: reply.id,
        author: reply.author,
        body: reply.body,
        createdAt: reply.created_at,
      }))
    : (detail?.replies || []).map((reply) => ({
        id: reply.id,
        author: reply.author,
        body: reply.body,
        createdAt: reply.createdAt,
      }));

  const postReply = async () => {
    const text = replyBody.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await writeChannelRow("messages", {
        id: uuid(),
        channel_id: channelId,
        thread_id: threadId,
        author: "you",
        body: text,
        created_at: new Date().toISOString(),
      });
      const mentions = parseMentions(text);
      if (mentions.length > 0) {
        await fetch("/api/channels/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId, threadId, text, mentions }),
        });
      }
      setReplyBody("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/mobile-v2/inbox/${channelId}`} className="inline-flex items-center gap-2 text-sm text-[var(--primary)]"><ArrowLeft className="size-4" /> Back to channel</Link>
          <h2 className="mt-2 line-clamp-2 text-lg font-semibold tracking-tight text-[var(--foreground)]">{detail?.thread.title || "Thread"}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <span>#{detail?.thread.channelName || channelId}</span>
            <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5">live</span>
            {detail?.thread.lifecycle && <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5">{detail.thread.lifecycle}</span>}
            {detail?.thread.state && <span className={`rounded-full border px-2 py-0.5 uppercase tracking-wide ${statusTone(detail.thread.state)}`}>{detail.thread.state}</span>}
            <span>updated {formatRelative(detail?.thread.updatedAt || detail?.thread.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCcw className="size-4" /> Refresh
          </Button>
          <Link href={`/channels/${channelId}/${threadId}`} className="inline-flex h-9 items-center rounded-md border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--foreground)]">
            Production <ExternalLink className="ml-2 size-4 text-[var(--primary)]" />
          </Link>
        </div>
      </div>

      {(error || live.error) && <div className="v2-surface p-4 text-sm text-[var(--destructive)]">{error || live.error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_360px]">
        <ThreadChatTranscript
          rootMessage={rootMessage}
          replies={replies}
          title="Conversation"
          description="Live thread chat"
          emptyLabel={loading || live.loading ? "Connecting…" : "No conversation yet"}
          emptyDescription="Type below to send a reply."
          footer={
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void postReply();
              }}
              className="w-full"
            >
              <InputGroup className="bg-white">
                <input
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Reply to this thread…"
                  disabled={sending}
                  className="h-14 w-full bg-transparent px-4 text-sm text-zinc-950 outline-none placeholder:text-zinc-500 disabled:opacity-50"
                />
                <InputGroupAddon align="block-end" className="pt-0">
                  <InputGroupButton
                    type="submit"
                    variant="default"
                    size="icon-sm"
                    disabled={!replyBody.trim() || sending}
                    className="ml-auto"
                    aria-label="Send reply"
                  >
                    <ArrowUpIcon />
                    <span className="sr-only">Send</span>
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          }
        />

        <div className="space-y-4">
          <Card size="sm" className="v2-surface py-3">
            <CardHeader className="pb-1"><CardTitle className="text-base">Context</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl border border-[var(--border)] bg-white p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Assignee</div>
                <div className="mt-1 text-[var(--foreground)]">{detail?.thread.assignee || "Unassigned"}</div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-white p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Repo</div>
                <div className="mt-1 text-[var(--foreground)]">{detail?.thread.repoName || "No repo linked"}</div>
                {detail?.thread.repoId && <Link href={`/mobile-v2/projects/${detail.thread.repoId}`} className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--primary)]"><FolderKanban className="size-3.5" /> Open project</Link>}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="plan" className="space-y-3">
            <TabsList>
              <TabsTrigger value="plan">Plan</TabsTrigger>
              <TabsTrigger value="steps">Steps</TabsTrigger>
              <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
            </TabsList>

            <TabsContent value="plan" className="space-y-2">
              {(extras?.plans || []).map((plan) => (
                <div key={plan.id} className="rounded-2xl border border-[var(--border)] bg-white p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-[var(--foreground)]">{plan.title}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusTone(plan.status)}`}>{plan.status}</span>
                  </div>
                </div>
              ))}
              {!loading && (extras?.plans || []).length === 0 && <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No plan items.</div>}
            </TabsContent>

            <TabsContent value="steps" className="space-y-2">
              {(extras?.steps || []).map((step) => (
                <div key={step.id} className="rounded-2xl border border-[var(--border)] bg-white p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-[var(--foreground)]">{step.step_label}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusTone(step.status)}`}>{step.status}</span>
                  </div>
                  {step.detail && <p className="mt-2 text-xs text-[var(--muted-foreground)]">{step.detail}</p>}
                </div>
              ))}
              {!loading && (extras?.steps || []).length === 0 && <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No workflow steps.</div>}
            </TabsContent>

            <TabsContent value="artifacts" className="space-y-2">
              {(extras?.artifacts || []).map((artifact) => (
                <div key={artifact.id} className="rounded-2xl border border-[var(--border)] bg-white p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-[var(--foreground)]">{artifact.title}</p>
                    <span className="text-xs text-[var(--muted-foreground)]">v{artifact.version}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{artifact.kind} · {formatRelative(artifact.created_at)}</p>
                </div>
              ))}
              {!loading && (extras?.artifacts || []).length === 0 && <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No artifacts yet.</div>}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
