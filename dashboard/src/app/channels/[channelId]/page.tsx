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
import { writeChannelRow, markChannelRead } from "../../writeChannelRow";
import { MentionInput, MessageBody, type MentionOption } from "../MentionInput";
import { parseMentions } from "../../../lib/mentions";
import { LIFECYCLES, defaultEnabledWorkflows } from "../lifecycles";

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export default function ChannelDetailPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = use(params);
  const [channelShape, setChannelShape] = useState<ReturnType<typeof getChannelShape> extends Promise<infer T> ? T : never | null>(null);
  const [memberShape, setMemberShape] = useState<ReturnType<typeof getMemberShape> extends Promise<infer T> ? T : never | null>(null);
  const [messageShape, setMessageShape] = useState<ReturnType<typeof getMessageShape> extends Promise<infer T> ? T : never | null>(null);
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
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-zinc-400">{err || "Connecting…"}</p>
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
  channelShape: ReturnType<typeof getChannelShape> extends Promise<infer T> ? T : never;
  memberShape: ReturnType<typeof getMemberShape> extends Promise<infer T> ? T : never;
  messageShape: ReturnType<typeof getMessageShape> extends Promise<infer T> ? T : never;
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
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16 flex flex-col items-center justify-center gap-2">
        <p className="text-sm text-zinc-400">Channel not found</p>
        <Link href="/channels" className="text-xs text-blue-600 underline">← Back to channels</Link>
      </div>
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
  const topLevel = channelMessages.filter((m) => !m.thread_id);
  topLevel.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const repliesCount = (msgId: string) =>
    channelMessages.filter((m) => m.thread_id === msgId).length;

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
        // For a new top-level thread, the message id IS the thread root.
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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto max-w-6xl px-3 py-2 flex items-center gap-2">
          <Link
            href="/channels"
            className="-ml-1 shrink-0 rounded-md px-2 py-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            aria-label="Back to channels"
          >
            ← Back
          </Link>
          <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate"># {channel.name}</h1>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-3 py-2 space-y-3">
        {/* members */}
        <div className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-1.5 text-[10px] font-medium uppercase text-zinc-400">Members</p>
          <div className="mb-2 flex flex-wrap gap-1">
            {channelMembers.length === 0 && (
              <span className="text-xs text-zinc-400">No projects or agents linked yet</span>
            )}
            {channelMembers.map((mem) => (
              <span
                key={mem.id}
                className="rounded px-1.5 py-0.5 text-[10px] bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {mem.member_type === "project" ? "📁" : "🤖"} {mem.member_name}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1">
              <input
                list="channel-project-options"
                value={addProject}
                onChange={(e) => setAddProject(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addMember("project", addProject); }}
                placeholder="Add project…"
                className="w-36 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              />
              <datalist id="channel-project-options">
                {repos.map((r) => (
                  <option key={r.id} value={r.name} />
                ))}
              </datalist>
              <button
                onClick={() => addMember("project", addProject)}
                disabled={!addProject.trim()}
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
              >
                Add
              </button>
            </div>
            <div className="flex gap-1">
              <input
                value={addAgent}
                onChange={(e) => setAddAgent(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addMember("agent", addAgent); }}
                placeholder="Add agent…"
                className="w-36 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              />
              <button
                onClick={() => addMember("agent", addAgent)}
                disabled={!addAgent.trim()}
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* messages / threads — or issues list for issue channels */}
        {channel.default_lifecycle === "issue" ? (
          <IssueList channelId={channelId} channelMessages={channelMessages} />
        ) : (
          <ThreadList
            channelId={channelId}
            channelMessages={channelMessages}
            composeBody={composeBody}
            setComposeBody={setComposeBody}
            mentionOptions={mentionOptions}
            sending={sending}
            setSending={setSending}
            router={router}
          />
        )}
      </div>
    </div>
  );
}

// ── ThreadList (non-issue channels) ─────────────────────────────

function ThreadList({
  channelId, channelMessages, composeBody, setComposeBody,
  mentionOptions, sending, setSending, router,
}: {
  channelId: string;
  channelMessages: ReturnType<typeof useMessageRows>;
  composeBody: string;
  setComposeBody: (v: string) => void;
  mentionOptions: MentionOption[];
  sending: boolean;
  setSending: (v: boolean) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const threadMeta = useChannelThreadMeta(channelId, 4000, showArchived);
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

  const renderThreadRow = (msg: ReturnType<typeof useMessageRows>[number], isArchived: boolean) => {
    const rc = isArchived
      ? 0
      : channelMessages.filter((m) => m.thread_id === msg.id).length;
    const last = isArchived
      ? null
      : channelMessages.filter((m) => m.thread_id === msg.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
    const meta = metaByThread[msg.id];
    const lc = meta ? LIFECYCLES[meta.lifecycle] : null;
    const stateLabel = meta && lc ? (lc.states[meta.state]?.label || meta.state) : null;
    const stateKind = meta && lc ? lc.states[meta.state]?.kind : null;
    return (
      <li key={msg.id}>
        <Link
          href={`/channels/${channelId}/${msg.id}`}
          className={`flex w-full items-start gap-2 px-3 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 md:py-2 ${isArchived ? "opacity-60" : ""}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`text-xs font-medium ${isArchived ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-700 dark:text-zinc-300"}`}>{msg.author}</span>
              <span className="text-[10px] text-zinc-400">{relativeTime(msg.created_at)}</span>
              {stateLabel && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                  stateKind === "wait"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : stateKind === "active"
                      ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}>
                  {stateLabel}
                </span>
              )}
              {isArchived && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                  archived
                </span>
              )}
              {meta?.assignee && (
                <span className="text-[10px] text-zinc-400">@{meta.assignee}</span>
              )}
            </div>
            <MessageBody body={msg.body} className={`whitespace-pre-wrap text-xs ${isArchived ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-700 dark:text-zinc-300"}`} />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
              {isArchived ? (
                <span>Archived · no replies</span>
              ) : (
                <>
                  <span>{rc > 0 ? `${rc} repl${rc === 1 ? "y" : "ies"}` : "Reply"} ›</span>
                  {last && (
                    <span className="truncate">
                      last {last.author} · {relativeTime(last.created_at)}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </Link>
      </li>
    );
  };

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

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <ul className="divide-y divide-zinc-50 dark:divide-zinc-800">
        {activeThreads.length === 0 && archivedThreads.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-zinc-400">No threads yet — start one below</li>
        )}
        {activeThreads.map((msg) => renderThreadRow(msg, false))}

        {archivedThreads.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="w-full px-3 py-2 text-left text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
            >
              {showArchived
                ? `▲ Hide archived (${archivedThreads.length})`
                : `▼ Show archived (${archivedThreads.length})`}
            </button>
          </li>
        )}

        {showArchived && archivedThreads.map((msg) => renderThreadRow(msg, true))}
      </ul>
      <div className="flex gap-1 border-t border-zinc-100 p-2 dark:border-zinc-800">
        <MentionInput
          value={composeBody}
          onChange={setComposeBody}
          onSubmit={() => { void postMessage(null, composeBody); }}
          placeholder="Start a thread… @agent to trigger"
          options={mentionOptions}
          disabled={sending}
          className="min-w-0 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        />
        <button
          onClick={() => { void postMessage(null, composeBody); }}
          disabled={!composeBody.trim() || sending}
          className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
        >
          {sending ? "…" : "Post"}
        </button>
      </div>
    </div>
  );
}

// ── IssueList (issue channels) ───────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950",
  high: "text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-950",
  medium: "text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-950",
  low: "text-zinc-500 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-800",
  none: "text-zinc-400 bg-transparent",
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

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => r.json())
      .then((d) => setRepos(d.repos || []))
      .catch(() => {});
  }, []);

  // Build issues list: join meta rows with their root messages
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

  return (
    <div className="space-y-2">
      {/* New-issue form toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => { setShowNewIssue((v) => !v); }}
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400"
        >
          {showNewIssue ? "Cancel" : "+ New Issue"}
        </button>
      </div>

      {showNewIssue && (
        <NewIssueForm
          channelId={channelId}
          repos={repos}
          onCreated={() => { setShowNewIssue(false); }}
        />
      )}

      {/* Issues list */}
      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {issues.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-zinc-400">
            No issues yet — create one above
          </p>
        ) : (
          <ul className="divide-y divide-zinc-50 dark:divide-zinc-800">
            {issues.map(({ meta, rootMsg, repo }) => {
              const prio = meta.priority || "none";
              const prioColor = PRIORITY_COLORS[prio] || PRIORITY_COLORS.none;
              const lc = LIFECYCLES.issue;
              const stateLabel = lc?.states[meta.state]?.label || meta.state;
              const replies = channelMessages
                .filter((m) => m.thread_id === meta.thread_id)
                .sort((a, b) => b.created_at.localeCompare(a.created_at));
              const last = replies[0] || null;
              return (
                <li key={meta.thread_id}>
                  <Link
                    href={`/channels/${channelId}/${meta.thread_id}`}
                    className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 md:py-2"
                  >
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${prioColor}`}>
                      {prio !== "none" ? prio : "—"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {rootMsg?.body ? rootMsg.body.split("\n")[0].slice(0, 120) : meta.thread_id}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
                        <span>{stateLabel}</span>
                        {meta.assignee && <span>· @{meta.assignee}</span>}
                        {repo && <span>· {repo.name}</span>}
                        {last && (
                          <span className="truncate">· last {last.author} · {relativeTime(last.created_at)}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── NewIssueForm ─────────────────────────────────────────────────

function NewIssueForm({
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
  // Register new repo inline
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
      // Create root message
      await writeChannelRow("messages", {
        id: threadId, channel_id: channelId, thread_id: null, author: "you",
        body, created_at: now,
      });
      // Create meta row with issue lifecycle
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
    } catch {
      /* handled by writeChannelRow */
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 space-y-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">New Issue</p>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title…"
        className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        disabled={creating}
      />

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description…"
        rows={3}
        className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        disabled={creating}
      />

      <div className="flex flex-wrap gap-2">
        {/* Priority */}
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="text-xs rounded border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          disabled={creating}
        >
          <option value="none">No priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>

        {/* Repo picker */}
        <select
          value={repoId}
          onChange={(e) => setRepoId(e.target.value)}
          className="text-xs rounded border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          disabled={creating}
        >
          <option value="">No repo</option>
          {repos.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>

        {/* + Register repo affordance */}
        <details className="text-xs">
          <summary className="cursor-pointer rounded border border-zinc-200 px-2 py-1 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">+ Register repo</summary>
          <div className="mt-2 flex flex-wrap gap-1">
            <input
              value={newRepoName}
              onChange={(e) => setNewRepoName(e.target.value)}
              placeholder="Name (e.g. ax-brain-crew)"
              className="w-44 rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              disabled={addingRepo}
            />
            <input
              value={newRepoPath}
              onChange={(e) => setNewRepoPath(e.target.value)}
              placeholder="/Users/bencharney/…"
              className="w-52 rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              disabled={addingRepo}
            />
            <button
              onClick={addRepo}
              disabled={!newRepoName.trim() || !newRepoPath.trim() || addingRepo}
              className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
            >
              Add
            </button>
            {addRepoError && <span className="text-[10px] text-red-500">{addRepoError}</span>}
          </div>
        </details>

        {/* Assignee */}
        <input
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          placeholder="Assignee (optional)"
          className="w-36 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          disabled={creating}
        />
      </div>

      <button
        onClick={createIssue}
        disabled={!title.trim() || creating}
        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 disabled:opacity-40 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      >
        {creating ? "Creating…" : "Create Issue"}
      </button>
    </div>
  );
}
