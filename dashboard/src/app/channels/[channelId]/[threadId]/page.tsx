"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getChannelShape, getMessageShape, getMemberShape,
  releaseChannelShape, releaseMessageShape, releaseMemberShape,
  useChannelRows, useMessageRows, useMemberRows,
  useThreadExtras,
  type ThreadMetaRow, type ThreadPromotionRow, type RepoRow, type ActivityEventRow,
} from "../../shapes";
import { writeChannelRow, markChannelRead } from "../../../writeChannelRow";
import { type MentionOption } from "../../MentionInput";
import { parseMentions } from "../../../../lib/mentions";
import { LIFECYCLES, DEFAULT_LIFECYCLE, defaultEnabledWorkflows } from "../../lifecycles";
import { RESEARCH_MODES, DEFAULT_RESEARCH_MODE } from "../../researchModes";
import { GuideBar } from "../../GuideBar";
import { MoveThreadDialog } from "../../MoveThreadDialog";
import { ThreadArtifactsTab } from "../../ThreadArtifactsTab";
import { ThreadConversationTab } from "../../ThreadConversationTab";
import { ThreadOverviewTab } from "../../ThreadOverviewTab";
import { ThreadTabs, type ThreadTabId } from "../../ThreadTabs";
import { ThreadWorkTab } from "../../ThreadWorkTab";

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export default function ThreadPage({ params }: { params: Promise<{ channelId: string; threadId: string }> }) {
  const { channelId, threadId } = use(params);
  const [channelShape, setChannelShape] = useState<ReturnType<typeof getChannelShape> extends Promise<infer T> ? T : never | null>(null);
  const [messageShape, setMessageShape] = useState<ReturnType<typeof getMessageShape> extends Promise<infer T> ? T : never | null>(null);
  const [memberShape, setMemberShape] = useState<ReturnType<typeof getMemberShape> extends Promise<infer T> ? T : never | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ok = true; setErr(null);
    const t = setTimeout(() => { if (ok) setErr("Timed out"); }, 12000);
    // Only the 3 shapes shared with the channel page — plans/steps/artifacts
    // are polled (useThreadExtras), keeping this page within SHAPE_BUDGET.
    Promise.all([getChannelShape(), getMessageShape(), getMemberShape()])
      .then(([chs, msgs, mems]) => {
        if (!ok) return;
        clearTimeout(t);
        setChannelShape(chs); setMessageShape(msgs); setMemberShape(mems);
      })
      .catch((e) => { if (ok) { clearTimeout(t); setErr(String(e)); } });
    return () => {
      ok = false;
      clearTimeout(t);
      releaseChannelShape();
      releaseMessageShape();
      releaseMemberShape();
    };
  }, []);

  if (!channelShape || !messageShape || !memberShape) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-zinc-400">{err || "Connecting…"}</p>
      </div>
    );
  }

  return (
    <ThreadContent
      channelShape={channelShape}
      messageShape={messageShape}
      memberShape={memberShape}
      channelId={channelId}
      threadId={threadId}
    />
  );
}

function ThreadContent({
  channelShape, messageShape, memberShape, channelId, threadId,
}: {
  channelShape: ReturnType<typeof getChannelShape> extends Promise<infer T> ? T : never;
  messageShape: ReturnType<typeof getMessageShape> extends Promise<infer T> ? T : never;
  memberShape: ReturnType<typeof getMemberShape> extends Promise<infer T> ? T : never;
  channelId: string;
  threadId: string;
}) {
  const channels = useChannelRows(channelShape);
  const messages = useMessageRows(messageShape);

  useEffect(() => {
    void markChannelRead(channelId);
  }, [channelId]);
  const members = useMemberRows(memberShape);
  const extras = useThreadExtras(threadId);
  const [replyBody, setReplyBody] = useState("");
  const [paseoOpts, setPaseoOpts] = useState<MentionOption[]>([]);
  const [sending, setSending] = useState(false);
  const [booted, setBooted] = useState(false);
  // Promote dialog state
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [promoteDestination, setPromoteDestination] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoteAnyway, setPromoteAnyway] = useState(false);
  const [dismissedPromotionId, setDismissedPromotionId] = useState<string | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [activeTab, setActiveTab] = useState<ThreadTabId>("conversation");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/agents/list")
      .then((r) => r.json())
      .then((d) => {
        const opts: MentionOption[] = (d.agents || []).map((a: { shortId?: string; id: string; name?: string; status?: string; provider?: string }) => ({
          handle: a.shortId || a.id.slice(0, 8),
          label: a.name || a.shortId || a.id,
          hint: `${a.status || ""} ${a.provider || ""}`.trim(),
        }));
        // Also offer common spawn aliases
        opts.push(
          { handle: "pi", label: "Pi (new)", hint: "spawn" },
          { handle: "claude", label: "Claude (new)", hint: "spawn" },
          { handle: "codex", label: "Codex (new)", hint: "spawn" },
        );
        setPaseoOpts(opts);
      })
      .catch(() => {});
  }, []);

  const mentionOptions: MentionOption[] = [
    ...members
      .filter((m) => m.channel_id === channelId && m.member_type === "agent")
      .map((m) => ({ handle: m.member_name, label: m.member_name, hint: "channel member" })),
    ...paseoOpts,
  ];

  const channel = channels.find((c) => c.id === channelId);
  const channelMessages = (messages || []).filter((m) => m.channel_id === channelId);
  const threadMsg = channelMessages.find((m) => m.id === threadId);
  const replies = channelMessages
    .filter((m) => m.thread_id === threadId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const plans = [...extras.plans].sort((a, b) => a.sort_order - b.sort_order);
  const steps = [...extras.steps].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const artifactsByTitle = new Map<string, typeof extras.artifacts>();
  for (const a of extras.artifacts) {
    artifactsByTitle.set(a.title, [...(artifactsByTitle.get(a.title) || []), a]);
  }
  const latestArtifacts = [...artifactsByTitle.values()].map((versions) =>
    [...versions].sort((a, b) => b.version - a.version)[0],
  );

  const togglePlanStatus = async (plan: (typeof plans)[number]) => {
    const status = plan.status === "done" ? "todo" : "done";
    await writeChannelRow("thread_plans", { ...plan, status, updated_at: new Date().toISOString() });
    await extras.refresh();
  };

  // Backfill enabled_workflows for meta rows created by an older client — does NOT
  // create a meta row from nothing. A thread has no lifecycle until the user picks one.
  useEffect(() => {
    if (!extras.meta) { if (!booted) setBooted(true); return; }
    if (booted) return;
    if (!extras.meta.enabled_workflows || extras.meta.enabled_workflows === "[]" || extras.meta.enabled_workflows === "") {
      const defaults = defaultEnabledWorkflows(extras.meta.lifecycle);
      if (defaults.length > 0) {
        writeChannelRow("thread_meta", {
          thread_id: threadId,
          channel_id: channelId,
          enabled_workflows: JSON.stringify(defaults),
          updated_at: new Date().toISOString(),
        }).then(() => extras.refresh()).catch(() => {});
      }
    }
    setBooted(true);
  }, [extras.meta, booted, threadId, channelId]);

  const meta: ThreadMetaRow | null = extras.meta;
  const lifecyclePicked = !!meta;
  const lifecycleKey = meta?.lifecycle || DEFAULT_LIFECYCLE;
  const currentState = meta?.state || LIFECYCLES[lifecycleKey]?.initial || "drafted";
  let enabledWorkflows: string[] = [];
  try { enabledWorkflows = meta?.enabled_workflows ? JSON.parse(meta.enabled_workflows) : []; } catch {}
  const lc = LIFECYCLES[lifecycleKey];
  const suggestedLifecycle = channel?.default_lifecycle && LIFECYCLES[channel.default_lifecycle]
    ? channel.default_lifecycle
    : DEFAULT_LIFECYCLE;

  // Promote state
  const isTerminal = lc?.states[currentState]?.terminal === true;
  const isArchived = !!meta?.archived_at;

  // Canonical channel redirect after a move (URL channelId can go stale)
  useEffect(() => {
    if (!extras.meta?.channel_id) return;
    if (extras.meta.channel_id !== channelId) {
      router.replace(`/channels/${extras.meta.channel_id}/${threadId}`);
    }
  }, [extras.meta?.channel_id, channelId, threadId, router]);

  const isPromoted = !!meta?.promoted_to;
  const rawPromotion: ThreadPromotionRow | null = extras.promotion;
  const promotion: ThreadPromotionRow | null =
    rawPromotion && rawPromotion.id === dismissedPromotionId ? null : rawPromotion;
  const isPromoting = promotion?.status === "running" || promoting;
  const promotionFailed = promotion?.status === "errored" || promotion?.status === "failed_required_gate";

  // Clear dismiss when a newer promotion arrives
  useEffect(() => {
    if (rawPromotion && rawPromotion.id !== dismissedPromotionId && rawPromotion.status === "running") {
      setDismissedPromotionId(null);
    }
  }, [rawPromotion?.id, rawPromotion?.status, dismissedPromotionId]);

  // Burst-refresh while promote is running so stage text stays fresh
  useEffect(() => {
    if (!isPromoting) return;
    const id = setInterval(() => { void extras.refresh(); }, 1200);
    return () => clearInterval(id);
  }, [isPromoting, extras.refresh]);

  // ── Live activity trace (current run only) ──────────────────────
  // Pick the most recent run_id and its events, oldest→newest.
  const currentRunId = extras.activity.length
    ? extras.activity[extras.activity.length - 1].run_id
    : null;
  const runEvents: ActivityEventRow[] = currentRunId
    ? extras.activity.filter((e) => e.run_id === currentRunId)
    : [];
  const latestEvent = runEvents.length ? runEvents[runEvents.length - 1] : null;
  const workCount =
    (plans.length > 0 ? 1 : 0) +
    (steps.length > 0 ? 1 : 0) +
    (latestEvent ? 1 : 0);
  const artifactCount = latestArtifacts.length;
  // A run is "active" while any event is still running AND it started recently
  // (guards against a wedged row keeping the burst loop alive forever).
  const activityRunning = runEvents.some((e) => {
    if (e.status !== "running") return false;
    const age = Date.now() - Date.parse(e.updated_at || e.created_at);
    return isNaN(age) || age < 30_000;
  });

  // Burst-refresh while the agent is actively working so the strip feels live.
  useEffect(() => {
    if (!activityRunning) return;
    const id = setInterval(() => { void extras.refresh(); }, 1200);
    return () => clearInterval(id);
  }, [activityRunning, extras.refresh]);

  const sanitizedName = (threadMsg?.body || "").split("\n")[0]
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 64) || `promoted-${threadId.slice(0, 8)}`;
  const defaultPromoteDestination = `~/Projects/${sanitizedName}`;
  // Picking a lifecycle for the first time is always allowed; changing it later is
  // only allowed while state is still "drafted".
  const handleLifecycleChange = async (newLc: string) => {
    if (meta && meta.state !== "drafted") return;
    const l = LIFECYCLES[newLc];
    if (!l) return;
    await writeChannelRow("thread_meta", {
      thread_id: threadId,
      channel_id: channelId,
      lifecycle: newLc,
      state: l.initial,
      enabled_workflows: JSON.stringify(defaultEnabledWorkflows(newLc)),
      updated_at: new Date().toISOString(),
      ...(meta ? { _lifecycle_switch: newLc } : {}),
    });
    await extras.refresh();
  };

  const researchMode = meta?.research_mode || DEFAULT_RESEARCH_MODE;
  const handleResearchModeChange = async (modeId: string) => {
    if (!RESEARCH_MODES[modeId]) return;
    await writeChannelRow("thread_meta", {
      thread_id: threadId,
      channel_id: channelId,
      research_mode: modeId,
      updated_at: new Date().toISOString(),
    });
    await extras.refresh();
  };

  const toggleWorkflow = async (wfId: string) => {
    const next = enabledWorkflows.includes(wfId)
      ? enabledWorkflows.filter((id) => id !== wfId)
      : [...enabledWorkflows, wfId];
    await writeChannelRow("thread_meta", {
      thread_id: threadId,
      channel_id: channelId,
      enabled_workflows: JSON.stringify(next),
      updated_at: new Date().toISOString(),
    });
    await extras.refresh();
  };

  const handlePromote = async (destination: string) => {
    const dest = destination.trim();
    if (!dest) {
      setPromoteError("Destination path is required");
      return;
    }
    setPromoting(true);
    setPromoteError(null);
    setShowPromoteDialog(false);
    setDismissedPromotionId(null);
    try {
      const res = await fetch("/api/channels/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, channelId, destinationPath: dest }),
      });
      const data = await res.json().catch(() => ({}));
      // 202 Accepted = background job started; show live progress.
      if (res.status === 202 || data.status === "running") {
        await extras.refresh();
        // keep promoting=true until poll sees running/terminal
        setTimeout(() => setPromoting(false), 2500);
        return;
      }
      if (!res.ok) {
        setPromoteError(data.error || `Server error: ${res.status}`);
        setShowPromoteDialog(true);
        setPromoting(false);
        return;
      }
      if (data.status === "failed_required_gate") {
        setPromoteError(`Required sections unfilled: ${(data.missingRequired || []).join(", ")}`);
        setShowPromoteDialog(true);
        setPromoting(false);
      } else if (data.status === "errored") {
        setPromoteError(data.error || "Promotion failed");
        setShowPromoteDialog(true);
        setPromoting(false);
      } else {
        await extras.refresh();
        setPromoting(false);
      }
    } catch (e) {
      setPromoteError(String(e));
      setShowPromoteDialog(true);
      setPromoting(false);
    }
  };
  const handleAdvanceDone = async () => {
    setAdvancing(true);
    try {
      await extras.refresh();
    } finally {
      setAdvancing(false);
    }
  };

  const openPromoteDialog = (destination = defaultPromoteDestination) => {
    setPromoteDestination(destination);
    setPromoteError(null);
    setShowPromoteDialog(true);
  };

  const handleRetryPromote = () => {
    const destination = promoteDestination.trim() || defaultPromoteDestination;
    setPromoteDestination(destination);
    setPromoteError(null);
    void handlePromote(destination);
  };

  const handleEditPromotePath = () => {
    openPromoteDialog(promoteDestination.trim() || defaultPromoteDestination);
  };

  const dismissPromotion = () => {
    if (rawPromotion?.id) setDismissedPromotionId(rawPromotion.id);
  };

  const issueHeader = lifecyclePicked && lifecycleKey === "issue" && meta
    ? <IssueHeader threadId={threadId} meta={meta} />
    : null;

  // After a move, messages are filtered by URL channelId so threadMsg vanishes
  // until redirect; meta (polled by threadId) still tells us the canonical home.
  if (extras.meta?.channel_id && extras.meta.channel_id !== channelId) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16 flex flex-col items-center justify-center gap-2">
        <p className="text-sm text-zinc-400">Redirecting to new channel…</p>
      </div>
    );
  }

  if (!channel || !threadMsg) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16 flex flex-col items-center justify-center gap-2">
        <p className="text-sm text-zinc-400">Thread not found</p>
        <Link href={`/channels/${channelId}`} className="text-xs text-blue-600 underline">
          ← Back to channel
        </Link>
      </div>
    );
  }

  const postReply = async (body: string) => {
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
    <div className="min-h-screen bg-zinc-50 pb-16 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-white/95 px-3 py-2 pt-[env(safe-area-inset-top,0px)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <Link
          href={`/channels/${channelId}`}
          className="-ml-1 shrink-0 rounded-md px-2 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          aria-label="Back to channel"
        >
          ← Back
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200"># {channel.name}</p>
          <p className="truncate text-[10px] text-zinc-400">Thread by {threadMsg.author}</p>
        </div>
        {!isArchived && (
          <button
            type="button"
            onClick={() => setShowMoveDialog(true)}
            className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Move…
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto max-w-3xl space-y-3">
          {isArchived && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                This thread was promoted to a project and is now archived (read-only).
              </p>
              <Link
                href="/projects"
                className="mt-1 inline-block text-[11px] font-medium text-amber-800 underline dark:text-amber-200"
              >
                Open Projects
              </Link>
            </div>
          )}
          {!lifecyclePicked && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950">
              <span className="text-[10px] font-medium uppercase tracking-wide text-blue-500">Suggestion</span>
              <span className="text-xs text-blue-700 dark:text-blue-300">
                Looks like a {LIFECYCLES[suggestedLifecycle]?.label || "coding"} task — run it as a{" "}
                {LIFECYCLES[suggestedLifecycle]?.label || "Coding"} flow?
              </span>
              <button
                type="button"
                onClick={() => { void handleLifecycleChange(suggestedLifecycle); }}
                className="ml-auto shrink-0 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800"
              >
                Accept
              </button>
              <select
                defaultValue=""
                onChange={(e) => { if (e.target.value) void handleLifecycleChange(e.target.value); }}
                className="text-xs rounded border border-blue-200 bg-white px-2 py-0.5 text-zinc-500 dark:border-blue-800 dark:bg-zinc-800 dark:text-zinc-400"
              >
                <option value="" disabled>Or pick…</option>
                {Object.entries(LIFECYCLES).map(([key, lcDef]) => (
                  <option key={key} value={key}>{lcDef.label}</option>
                ))}
              </select>
            </div>
          )}


          {lifecyclePicked && lc && !isArchived && (
            <GuideBar
              lifecycleKey={lifecycleKey}
              currentState={currentState}
              enabledWorkflows={enabledWorkflows}
              channelId={channelId}
              threadId={threadId}
              onDone={async () => { await extras.refresh(); }}
              onPromote={() => {
                openPromoteDialog();
              }}
            />
          )}
          {issueHeader}


          <ThreadTabs
            active={activeTab}
            onChange={setActiveTab}
            counts={{ work: workCount, artifacts: artifactCount }}
          />

          {activeTab === "conversation" && (
            <ThreadConversationTab
              threadMsg={threadMsg}
              replies={replies}
              graphEvents={extras.graphEvents}
              graphDecisions={extras.graphDecisions}
              graphObservations={extras.graphObservations}
              graphProposals={extras.graphProposals}
              continuity={extras.continuity}
              replyBody={replyBody}
              onReplyBodyChange={setReplyBody}
              onSubmitReply={() => { void postReply(replyBody); }}
              mentionOptions={mentionOptions}
              sending={sending}
              isArchived={isArchived}
            />
          )}

          {activeTab === "overview" && (
            <ThreadOverviewTab
              lifecyclePicked={lifecyclePicked}
              lifecycleKey={lifecycleKey}
              currentState={currentState}
              meta={meta}
              suggestedLifecycle={suggestedLifecycle}
              enabledWorkflows={enabledWorkflows}
              researchMode={researchMode}
              isArchived={isArchived}
              isPromoted={isPromoted}
              isPromoting={isPromoting}
              promotion={promotion}
              promoteAnyway={promoteAnyway}
              promotedTo={meta?.promoted_to || null}
              repoId={meta?.repo_id || null}
              channelId={channelId}
              threadId={threadId}
              disabledAdvance={advancing}
              promotionFailed={promotionFailed}
              showPromoteDialog={showPromoteDialog}
              onAcceptSuggestedLifecycle={() => { void handleLifecycleChange(suggestedLifecycle); }}
              onLifecycleChange={(nextLifecycle) => { void handleLifecycleChange(nextLifecycle); }}
              onResearchModeChange={(modeId) => { void handleResearchModeChange(modeId); }}
              onToggleWorkflow={(wfId) => { void toggleWorkflow(wfId); }}
              onAdvanceDone={handleAdvanceDone}
              onPromoteClick={() => {
                openPromoteDialog();
              }}
              onRetryPromote={handleRetryPromote}
              onEditPromotePath={handleEditPromotePath}
              onDismissPromotion={dismissPromotion}
              onForcePromoteAnyway={() => { setPromoteAnyway(true); }}
              issueHeader={null}
            />
          )}

          {activeTab === "work" && (
            <ThreadWorkTab
              plans={plans}
              steps={steps}
              runEvents={runEvents}
              latestEvent={latestEvent}
              activityRunning={activityRunning}
              currentStateLabel={lc?.states[currentState]?.label || currentState}
              onTogglePlanStatus={(plan) => { void togglePlanStatus(plan); }}
            />
          )}

          {activeTab === "artifacts" && (
            <ThreadArtifactsTab artifacts={latestArtifacts} />
          )}

          {showPromoteDialog && (
            <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                {promotionFailed ? "Retry promote" : "Promote to Project"}
              </p>
              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                Scaffold a standalone AIWG project from this thread’s messages, plans, and artifacts.
                One-shot — no live sync back. You'll need to push to a remote manually.
              </p>
              <label className="mb-1 block text-[10px] text-zinc-400">Destination path</label>
              <input
                type="text"
                value={promoteDestination}
                onChange={(e) => setPromoteDestination(e.target.value)}
                placeholder="~/Projects/my-project"
                className="mb-2 w-full rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                disabled={promoting}
              />
              {promoteError && (
                <p className="mb-2 text-[10px] text-red-500">{promoteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { void handlePromote(promoteDestination); }}
                  disabled={!promoteDestination.trim() || promoting}
                  className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 disabled:opacity-40 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  {promoting ? "Promoting…" : "Promote"}
                </button>
                <button
                  onClick={() => { setShowPromoteDialog(false); setPromoteError(null); }}
                  disabled={promoting}
                  className="rounded border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <MoveThreadDialog
        open={showMoveDialog}
        onClose={() => setShowMoveDialog(false)}
        threadId={threadId}
        fromChannelId={channelId}
        channels={channels.map((c) => ({ id: c.id, name: c.name }))}
        onMoved={(toChannelId) => {
          setShowMoveDialog(false);
          router.push(`/channels/${toChannelId}/${threadId}`);
        }}
      />
    </div>
  );
}

// ── IssueHeader: shown on thread detail when lifecycle is "issue" ─

function IssueHeader({ threadId, meta }: { threadId: string; meta: ThreadMetaRow }) {
  const [repoName, setRepoName] = useState<string | null>(null);
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editPriority, setEditPriority] = useState(meta.priority || "none");
  const [editAssignee, setEditAssignee] = useState(meta.assignee || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meta.repo_id) {
      fetch("/api/repos")
        .then((r) => r.json())
        .then((d) => {
          const repo = (d.repos || []).find((r: RepoRow) => r.id === meta.repo_id);
          if (repo) { setRepoName(repo.name); setRepoPath(repo.path); }
        })
        .catch(() => {});
    }
  }, [meta.repo_id]);

  const save = async () => {
    setSaving(true);
    try {
      await writeChannelRow("thread_meta", {
        thread_id: threadId,
        channel_id: meta.channel_id,
        priority: editPriority === "none" ? null : editPriority,
        assignee: editAssignee.trim() || null,
        updated_at: new Date().toISOString(),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const prioLabels: Record<string, string> = { none: "—", low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
  const prioColors: Record<string, string> = {
    urgent: "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950",
    high: "text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-950",
    medium: "text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-950",
    low: "text-zinc-500 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-800",
    none: "text-zinc-400 bg-transparent",
  };

  const prio = meta.priority || "none";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${prioColors[prio]}`}>
          {prioLabels[prio]}
        </span>
        {meta.assignee && (
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">@{meta.assignee}</span>
        )}
        {repoName && (
          <span className="text-[10px] text-zinc-400">
            📁 {repoName}
            {repoPath && <span className="ml-1 font-mono text-zinc-300 dark:text-zinc-600">{repoPath}</span>}
          </span>
        )}
        <div className="ml-auto">
          {editing ? (
            <div className="flex items-center gap-1">
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value)}
                className="text-[10px] rounded border border-zinc-200 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                disabled={saving}
              >
                <option value="none">—</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <input
                value={editAssignee}
                onChange={(e) => setEditAssignee(e.target.value)}
                placeholder="Assignee…"
                className="w-24 text-[10px] rounded border border-zinc-200 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                disabled={saving}
              />
              <button
                onClick={save}
                disabled={saving}
                className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
              >
                ✓
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded px-1 py-0.5 text-[10px] text-zinc-400"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setEditPriority(meta.priority || "none");
                setEditAssignee(meta.assignee || "");
                setEditing(true);
              }}
              className="text-[10px] text-zinc-400 underline hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

