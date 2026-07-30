"use client";

import { useEffect, useState, use, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getChannelShape, getMemberShape, getMessageShape,
  releaseChannelShape, releaseMemberShape, releaseMessageShape,
  useChannelRows, useMemberRows, useMessageRows, relativeTime,
  useIssuesMeta, useChannelThreadMeta, type RepoRow,
  type ThreadMetaRow,
} from "../shapes";
import {
  PageShell,
  StatusChip,
  Card,
  CardContent,
  DividedList,
  DividedRow,
  type UiTone,
  cx,
} from "@/components/ui";
import { writeChannelRow, markChannelRead } from "../../writeChannelRow";
import { MentionInput, MessageBody, type MentionOption } from "../MentionInput";
import { ChannelKanbanBoard, buildKanbanCards } from "../ChannelKanbanBoard";
import { parseMentions } from "../../../lib/mentions";
import { LIFECYCLES, defaultEnabledWorkflows } from "../lifecycles";
import type { ShapeMaterialization } from "@electric-circuits/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

// ── state → UiTone (proto-5) ──

function stateTone(state: string): UiTone {
  const s = state.toLowerCase();
  if (s === "in_progress" || s === "running") return "active";
  if (s === "review") return "wait";
  if (s === "blocked" || s === "failed" || s === "fail") return "danger";
  if (s === "resolved" || s === "shipped" || s === "verified") return "good";
  if (s === "approved") return "primary";
  if (s === "drafted") return "open";
  return "open";
}

// ── PAGE ──

export default function ChannelDetailPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = use(params);
  const [channelShape, setChannelShape] = useState<ShapeMaterialization | null>(null);
  const [memberShape, setMemberShape] = useState<ShapeMaterialization | null>(null);
  const [messageShape, setMessageShape] = useState<ShapeMaterialization | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ok = true; setErr(null);
    const t = setTimeout(() => { if (ok) setErr("Timed out"); }, 12000);
    Promise.all([getChannelShape(), getMemberShape(), getMessageShape()])
      .then(([chs, ms, msgs]) => {
        if (!ok) return;
        clearTimeout(t);
        setChannelShape(chs); setMemberShape(ms); setMessageShape(msgs);
      })
      .catch((e) => { if (ok) { clearTimeout(t); setErr(String(e)); } });
    return () => {
      ok = false;
      clearTimeout(t);
      releaseChannelShape();
      releaseMemberShape();
      releaseMessageShape();
    };
  }, []);

  if (!channelShape || !memberShape || !messageShape) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-16">
        <p className="text-sm text-muted-foreground animate-pulse">{err || "Connecting…"}</p>
      </div>
    );
  }

  return (
    <ChannelDetail
      channelShape={channelShape}
      memberShape={memberShape}
      messageShape={messageShape}
      channelId={channelId}
    />
  );
}

function ChannelDetail({
  channelShape, memberShape, messageShape, channelId,
}: {
  channelShape: ShapeMaterialization;
  memberShape: ShapeMaterialization;
  messageShape: ShapeMaterialization;
  channelId: string;
}) {
  const channels = useChannelRows(channelShape);
  const members = useMemberRows(memberShape);
  const messages = useMessageRows(messageShape);
  const router = useRouter();
  const [composeBody, setComposeBody] = useState("");
  const [paseoOpts, setPaseoOpts] = useState<MentionOption[]>([]);
  const [sending, setSending] = useState(false);
  const [addProject, setAddProject] = useState("");
  const [addAgent, setAddAgent] = useState("");
  const [repos, setRepos] = useState<RepoRow[]>([]);

  useEffect(() => {
    void markChannelRead(channelId);
  }, [channelId]);

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => r.json())
      .then((d) => setRepos(d.repos || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/agents/list")
      .then((r) => r.json())
      .then((d) => {
        const opts: MentionOption[] = (d.agents || []).map((a: { shortId?: string; id: string; name?: string; status?: string; provider?: string }) => ({
          handle: a.shortId || a.id.slice(0, 8),
          label: a.name || a.shortId || a.id,
          hint: `${a.status || ""} ${a.provider || ""}`.trim(),
        }));
        opts.push(
          { handle: "pi", label: "Pi (new)", hint: "spawn" },
          { handle: "claude", label: "Claude (new)", hint: "spawn" },
          { handle: "codex", label: "Codex (new)", hint: "spawn" },
        );
        setPaseoOpts(opts);
      })
      .catch(() => {});
  }, []);

  const channel = channels.find((c) => c.id === channelId);

  if (!channel) {
    return (
      <PageShell maxWidth="max-w-5xl" className="pb-4">
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <p className="text-sm text-muted-foreground">Channel not found</p>
          <Link href="/channels" className="text-xs font-medium text-primary hover:underline">← Back to channels</Link>
        </div>
      </PageShell>
    );
  }

  const channelMembers = (members || []).filter((m) => m.channel_id === channelId);
  const mentionOptions: MentionOption[] = [
    ...channelMembers
      .filter((m) => m.member_type === "agent")
      .map((m) => ({ handle: m.member_name, label: m.member_name, hint: "channel member" })),
    ...paseoOpts,
  ];
  const channelMessages = (messages || []).filter((m) => m.channel_id === channelId);

  const postMessage = async (threadId: string | null, body: string) => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const id = uuid();
      await writeChannelRow("messages", {
        id, channel_id: channelId, thread_id: threadId, author: "you",
        body: text, created_at: new Date().toISOString(),
      });
      const mentions = parseMentions(text);
      if (mentions.length > 0) {
        const rootId = threadId ?? id;
        await fetch("/api/channels/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId, threadId: rootId, text, mentions }),
        });
        if (!threadId) router.push(`/channels/${channelId}/${id}`);
      }
      setComposeBody("");
    } finally {
      setSending(false);
    }
  };

  const addMember = async (memberType: "project" | "agent", memberName: string) => {
    const name = memberName.trim();
    if (!name) return;
    await writeChannelRow("channel_members", {
      id: uuid(), channel_id: channelId, member_type: memberType, member_name: name,
      created_at: new Date().toISOString(),
    });
    if (memberType === "project") setAddProject(""); else setAddAgent("");
  };

  return (
    <PageShell maxWidth="max-w-5xl" className="pb-4">
      {/* Header (proto-5 style) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/channels"
            className="shrink-0 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            aria-label="Back to channels"
          >
            ←
          </Link>
          <h1 className="text-lg font-bold tracking-tight"># {channel.name}</h1>
        </div>
        {channel.default_lifecycle && channel.default_lifecycle !== "coding" && (
          <StatusChip tone="neutral">{LIFECYCLES[channel.default_lifecycle]?.label || channel.default_lifecycle}</StatusChip>
        )}
      </div>

      <Sheet>
        <SheetTrigger
          className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
          render={<Button variant="outline" size="sm" className="h-7 text-[10px]" />}
        >
          Members{channelMembers.length > 0 ? ` (${channelMembers.length})` : ""}
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Members</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-3">
            <div className="flex flex-wrap gap-1">
              {channelMembers.length === 0 && (
                <span className="text-xs text-muted-foreground">No projects or agents linked</span>
              )}
              {channelMembers.map((mem) => (
                <span
                  key={mem.id}
                  className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] bg-muted/50 text-muted-foreground"
                >
                  {mem.member_type === "project" ? "📁" : "🤖"} {mem.member_name}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1">
                <Input
                  list="channel-project-options"
                  value={addProject}
                  onChange={(e) => setAddProject(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addMember("project", addProject); }}
                  placeholder="Add project…"
                  className="h-7 w-32 text-xs"
                />
                <datalist id="channel-project-options">
                  {repos.map((r) => (
                    <option key={r.id} value={r.name} />
                  ))}
                </datalist>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addMember("project", addProject)}
                  disabled={!addProject.trim()}
                >
                  Add
                </Button>
              </div>
              <div className="flex gap-1">
                <Input
                  value={addAgent}
                  onChange={(e) => setAddAgent(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addMember("agent", addAgent); }}
                  placeholder="Add agent…"
                  className="h-7 w-32 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addMember("agent", addAgent)}
                  disabled={!addAgent.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Thread list / Issue list */}
      {channel.default_lifecycle === "issue" ? (
        <IssueList channelId={channelId} channelMessages={channelMessages} />
      ) : (
        <ThreadList
          channelId={channelId}
          lifecycleKey={channel.default_lifecycle || "coding"}
          channelMessages={channelMessages}
          composeBody={composeBody}
          setComposeBody={setComposeBody}
          mentionOptions={mentionOptions}
          sending={sending}
          setSending={setSending}
          router={router}
        />
      )}
    </PageShell>
  );
}

// ── ThreadList (proto-5 style) ──

function ThreadList({
  channelId, lifecycleKey, channelMessages, composeBody, setComposeBody,
  mentionOptions, sending, setSending, router,
}: {
  channelId: string;
  lifecycleKey: string;
  channelMessages: ReturnType<typeof useMessageRows>;
  composeBody: string;
  setComposeBody: (v: string) => void;
  mentionOptions: MentionOption[];
  sending: boolean;
  setSending: (v: boolean) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<"list" | "board">("list");
  const [boardTick, setBoardTick] = useState(0);
  const threadMeta = useChannelThreadMeta(channelId, 4000, true);
  const metaByThread = useMemo(() => {
    const m: Record<string, ThreadMetaRow> = {};
    for (const row of threadMeta) m[row.thread_id] = row;
    return m;
  }, [threadMeta]);

  const topLevel = useMemo(() => {
    const roots = channelMessages.filter((m) => !m.thread_id);
    const lastAt = (rootId: string) => {
      let latest = "";
      for (const m of channelMessages) {
        if ((m.id === rootId || m.thread_id === rootId) && m.created_at > latest) {
          latest = m.created_at;
        }
      }
      return latest;
    };
    return [...roots].sort((a, b) => lastAt(b.id).localeCompare(lastAt(a.id)));
  }, [channelMessages]);

  const activeThreads = useMemo(() =>
    topLevel.filter((msg) => !metaByThread[msg.id]?.archived_at),
    [topLevel, metaByThread],
  );
  const archivedThreads = useMemo(() =>
    topLevel.filter((msg) => !!metaByThread[msg.id]?.archived_at),
    [topLevel, metaByThread],
  );

  const kanbanCards = useMemo(
    () =>
      buildKanbanCards({
        roots: activeThreads,
        channelMessages,
        metaByThread,
        defaultLifecycle: lifecycleKey,
      }),
    // boardTick forces rebuild after successful drag transition while Electric catches up
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeThreads, channelMessages, metaByThread, lifecycleKey, boardTick],
  );

  const postMessage = async (threadId: string | null, body: string) => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const id = uuid();
      await writeChannelRow("messages", {
        id, channel_id: channelId, thread_id: threadId, author: "you",
        body: text, created_at: new Date().toISOString(),
      });
      const mentions = parseMentions(text);
      if (mentions.length > 0) {
        const rootId = threadId ?? id;
        await fetch("/api/channels/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId, threadId: rootId, text, mentions }),
        });
        if (!threadId) router.push(`/channels/${channelId}/${id}`);
      }
      setComposeBody("");
    } finally {
      setSending(false);
    }
  };

  const empty = (activeThreads.length === 0 && archivedThreads.length === 0);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Threads
        </p>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setView("board")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
              view === "board"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Board
          </button>
        </div>
      </div>

      {view === "board" ? (
        <ChannelKanbanBoard
          channelId={channelId}
          lifecycleKey={lifecycleKey}
          cards={kanbanCards}
          onTransitioned={() => setBoardTick((n) => n + 1)}
        />
      ) : (
      <DividedList
        empty={
          <span className="text-xs text-muted-foreground">
            No threads yet — start one below.
          </span>
        }
      >
        {activeThreads.map((msg) => {
          const meta = metaByThread[msg.id];
          const lc = meta ? LIFECYCLES[meta.lifecycle] : null;
          const state = meta?.state || "open";
          const tone = stateTone(state);
          const replies = channelMessages.filter((m) => m.thread_id === msg.id).length;
          const last = channelMessages
            .filter((m) => m.thread_id === msg.id)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;

          return (
            <DividedRow
              key={msg.id}
              href={`/channels/${channelId}/${msg.id}`}
              accent={tone}
            >
              <div className="flex items-center gap-2 w-full">
                <StatusChip tone={tone}>{state}</StatusChip>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate font-medium">
                    {msg.body ? msg.body.slice(0, 80) : "(no title)"}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {msg.author}
                    {meta?.assignee ? ` · assigned to ${meta.assignee}` : ""}
                    {" · "}{replies} repl{replies === 1 ? "y" : "ies"}
                    {last ? ` · last ${last.author} ${relativeTime(last.created_at)}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {relativeTime(msg.created_at)}
                </span>
              </div>
            </DividedRow>
          );
        })}

        {archivedThreads.length > 0 && (
          <li className="!border-0">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="w-full px-4 py-2 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted/60"
            >
              {showArchived
                ? `▲ Hide archived (${archivedThreads.length})`
                : `▼ Show archived (${archivedThreads.length})`}
            </button>
          </li>
        )}

        {showArchived && archivedThreads.map((msg) => {
          const meta = metaByThread[msg.id];
          const tone = stateTone(meta?.state || "open");
          return (
            <DividedRow
              key={msg.id}
              href={`/channels/${channelId}/${msg.id}`}
              accent={tone}
            >
              <div className="flex items-center gap-2 w-full opacity-50">
                <StatusChip tone="neutral">archived</StatusChip>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">
                    {msg.body ? msg.body.slice(0, 80) : "(no title)"}
                  </p>
                </div>
              </div>
            </DividedRow>
          );
        })}
      </DividedList>
      )}

      {/* Compose bar */}
      <div className="flex gap-1">
        <MentionInput
          value={composeBody}
          onChange={setComposeBody}
          onSubmit={() => { void postMessage(null, composeBody); }}
          placeholder="Start a thread… @agent to trigger"
          options={mentionOptions}
          disabled={sending}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => { void postMessage(null, composeBody); }}
          disabled={!composeBody.trim() || sending}
          className="shrink-0"
        >
          {sending ? "…" : "Post"}
        </Button>
      </div>
    </>
  );
}

// ── IssueList (proto-5 style) ──

const PRIORITY_TO_TONE: Record<string, UiTone> = {
  urgent: "danger",
  high: "wait",
  medium: "active",
  low: "neutral",
  none: "neutral",
};

const STATE_ORDER = ["open", "triaged", "in_progress", "blocked", "resolved", "closed", "wont_fix"];

function IssueList({
  channelId, channelMessages,
}: {
  channelId: string;
  channelMessages: ReturnType<typeof useMessageRows>;
}) {
  const issuesMeta = useIssuesMeta(channelId);
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [view, setView] = useState<"list" | "board">("list");
  const [boardTick, setBoardTick] = useState(0);

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => r.json())
      .then((d) => setRepos(d.repos || []))
      .catch(() => {});
  }, []);

  const msgById = new Map(channelMessages.map((m) => [m.id, m]));
  const issues = issuesMeta
    .map((meta) => ({
      meta,
      rootMsg: msgById.get(meta.thread_id),
      repo: repos.find((r) => r.id === meta.repo_id),
    }))
    .filter((i) => i.rootMsg)
    .sort((a, b) => {
      const sa = STATE_ORDER.indexOf(a.meta.state);
      const sb = STATE_ORDER.indexOf(b.meta.state);
      if (sa !== sb) return sa - sb;
      return (a.rootMsg?.created_at || "").localeCompare(b.rootMsg?.created_at || "");
    });

  // Build kanban cards from issue data
  const issueRoots = issues.map((i) => i.rootMsg!).filter(Boolean);
  const metaByThread = useMemo(() => {
    const m: Record<string, ThreadMetaRow> = {};
    for (const row of issuesMeta) m[row.thread_id] = row;
    return m;
  }, [issuesMeta]);
  const kanbanCards = useMemo(
    () => buildKanbanCards({
      roots: issueRoots,
      channelMessages,
      metaByThread,
      defaultLifecycle: "issue",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [issueRoots, channelMessages, metaByThread, boardTick],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setView("board")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
              view === "board"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Board
          </button>
        </div>
        <button
          onClick={() => { setShowNewIssue((v) => !v); }}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {showNewIssue ? "Cancel" : "+ New Issue"}
        </button>
      </div>

      {showNewIssue && (
        <IssueForm
          channelId={channelId}
          repos={repos}
          onCreated={() => { setShowNewIssue(false); }}
        />
      )}

      {view === "board" ? (
        <ChannelKanbanBoard
          channelId={channelId}
          lifecycleKey="issue"
          cards={kanbanCards}
          onTransitioned={() => setBoardTick((n) => n + 1)}
        />
      ) : (
      <DividedList
        empty={
          <span className="text-xs text-muted-foreground">
            No issues yet — create one above.
          </span>
        }
      >
        {issues.map(({ meta, rootMsg, repo }) => {
          const tone = stateTone(meta.state);
          const lc = LIFECYCLES.issue;
          const stateLabel = lc?.states[meta.state]?.label || meta.state;
          const replies = channelMessages
            .filter((m) => m.thread_id === meta.thread_id)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          const last = replies[0] || null;

          return (
            <DividedRow
              key={meta.thread_id}
              href={`/channels/${channelId}/${meta.thread_id}`}
              accent={tone}
            >
              <div className="flex items-center gap-2 w-full">
                <StatusChip tone={tone}>{stateLabel}</StatusChip>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate font-medium">
                    {rootMsg?.body ? rootMsg.body.split("\n")[0].slice(0, 120) : meta.thread_id}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {meta.priority !== "none" && meta.priority ? `${meta.priority} · ` : ""}
                    {meta.assignee ? `@${meta.assignee} · ` : ""}
                    {repo ? `${repo.name} · ` : ""}
                    {replies.length} repl{replies.length === 1 ? "y" : "ies"}
                    {last ? ` · last ${last.author} ${relativeTime(last.created_at)}` : ""}
                  </p>
                </div>
              </div>
            </DividedRow>
          );
        })}
      </DividedList>
      )}
    </div>
  );
}

// ── IssueForm ──

function IssueForm({
  channelId, repos, onCreated,
}: {
  channelId: string;
  repos: RepoRow[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [repoId, setRepoId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [creating, setCreating] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoPath, setNewRepoPath] = useState("");
  const [addingRepo, setAddingRepo] = useState(false);
  const [addRepoError, setAddRepoError] = useState<string | null>(null);

  const addRepo = async () => {
    const name = newRepoName.trim();
    const path = newRepoPath.trim();
    if (!name || !path || addingRepo) return;
    setAddingRepo(true);
    setAddRepoError(null);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, path }),
      });
      const d = await res.json();
      if (!res.ok) { setAddRepoError(d.error || "Failed"); return; }
      if (d.repo) {
        repos.push(d.repo);
        setRepoId(d.repo.id);
      }
      setNewRepoName("");
      setNewRepoPath("");
    } finally {
      setAddingRepo(false);
    }
  };

  const createIssue = async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      const threadId = uuid();
      const now = new Date().toISOString();
      const body = description.trim() ? `${title.trim()}\n\n${description.trim()}` : title.trim();
      await writeChannelRow("messages", {
        id: threadId, channel_id: channelId, thread_id: null, author: "you",
        body, created_at: now,
      });
      await writeChannelRow("thread_meta", {
        thread_id: threadId,
        channel_id: channelId,
        lifecycle: "issue",
        state: "open",
        enabled_workflows: JSON.stringify(defaultEnabledWorkflows("issue")),
        priority,
        assignee: assignee.trim() || null,
        repo_id: repoId || null,
        labels: "[]",
        updated_at: now,
      });
      setTitle("");
      setDescription("");
      onCreated();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card size="sm">
      <CardContent>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-2">New Issue</p>
        <div className="space-y-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title…"
            className="h-8 text-xs"
            disabled={creating}
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description…"
            rows={3}
            className="text-xs"
            disabled={creating}
          />
          <div className="flex flex-wrap gap-2">
            <Select
              value={priority}
              onValueChange={(value) => {
                if (typeof value === "string") setPriority(value);
              }}
              disabled={creating}
            >
              <SelectTrigger size="sm" className="w-auto">
                <SelectValue>
                  {({ none: "No priority", low: "Low", medium: "Medium", high: "High", urgent: "Urgent" } as Record<string, string>)[priority] || priority}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={repoId || "__none__"}
              onValueChange={(value) => {
                setRepoId(typeof value === "string" && value !== "__none__" ? value : "");
              }}
              disabled={creating}
            >
              <SelectTrigger size="sm" className="w-auto">
                <SelectValue>
                  {repoId ? repos.find((r) => r.id === repoId)?.name || "Repo" : "No repo"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No repo</SelectItem>
                {repos.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <details className="text-xs">
              <summary className="cursor-pointer rounded border border-border px-2 py-1 text-muted-foreground">+ Register repo</summary>
              <div className="mt-2 flex flex-wrap gap-1">
                <input
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  placeholder="Name"
                  className="w-40 rounded border border-border px-2 py-1 text-xs bg-background"
                  disabled={addingRepo}
                />
                <input
                  value={newRepoPath}
                  onChange={(e) => setNewRepoPath(e.target.value)}
                  placeholder="~/Projects/…"
                  className="w-52 rounded border border-border px-2 py-1 text-xs bg-background"
                  disabled={addingRepo}
                />
                <button
                  onClick={addRepo}
                  disabled={!newRepoName.trim() || !newRepoPath.trim() || addingRepo}
                  className="rounded border border-border px-2 py-1 text-xs text-muted-foreground disabled:opacity-40"
                >
                  Add
                </button>
                {addRepoError && <span className="text-[10px] text-red-500">{addRepoError}</span>}
              </div>
            </details>
            <input
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="Assignee (optional)"
              className="w-36 rounded-md border border-border bg-background px-2 py-1 text-xs"
              disabled={creating}
            />
          </div>
          <Button
            type="button"
            onClick={createIssue}
            disabled={!title.trim() || creating}
            className="border-emerald-500/30 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            size="sm"
          >
            {creating ? "Creating…" : "Create Issue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
