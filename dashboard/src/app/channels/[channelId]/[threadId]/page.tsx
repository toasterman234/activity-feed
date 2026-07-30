"use client";

import { useEffect, useState, use, useMemo } from "react";
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
import { WorkflowCockpit } from "../../WorkflowCockpit";
import { StageActionBar } from "../../StageActionBar";
import { DoNowBanner } from "../../DoNowBanner";
import { deriveThreadAttention } from "../../attentionGuide";
import { proposeIssueMetaHeal, DEFAULT_ISSUE_OWNER } from "../../issueMetaHeal";
import { ThreadStageStack } from "../../ThreadStageStack";
import { MoveThreadDialog } from "../../MoveThreadDialog";
import { ThreadArtifactsTab } from "../../ThreadArtifactsTab";
import { ThreadConversationTab } from "../../ThreadConversationTab";
import { ThreadOverviewTab } from "../../ThreadOverviewTab";
import { ThreadTabs, type ThreadTabId } from "../../ThreadTabs";
import { ThreadWorkTab } from "../../ThreadWorkTab";
import { WorkRunsPanel } from "../../WorkRunsPanel";
import { ThreadHistoryTab } from "../../ThreadHistoryTab";
import { Card, CardContent, StatusChip, cx, type UiTone } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
      <div className="min-h-screen bg-background flex items-center justify-center pb-16">
        <p className="text-sm text-muted-foreground animate-pulse">{err || "Connecting…"}</p>
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
  const [healed, setHealed] = useState(false);
  // Promote dialog state
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [promoteDestination, setPromoteDestination] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoteAnyway, setPromoteAnyway] = useState(false);
  const [dismissedPromotionId, setDismissedPromotionId] = useState<string | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [activeTab, setActiveTab] = useState<ThreadTabId>("work");
  const [focusTriage, setFocusTriage] = useState(false);
  const [triageAnchor, setTriageAnchor] = useState(0);
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const need = new URLSearchParams(window.location.search).get("need");
    if (need === "triage") setFocusTriage(true);
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

  // Heal issue metadata (default owner, infer repo) on first load.
  // Identity is the data itself — skip if already satisfied.
  useEffect(() => {
    if (!extras.meta) return;
    if (extras.meta.lifecycle !== "issue" || extras.meta.state !== "open") return;
    const hasOwner = !!(extras.meta.assignee || "").trim();
    const hasRepo = !!extras.meta.repo_id;
    if (hasOwner && hasRepo) return;
    if (!threadMsg) return;
    fetch("/api/repos")
      .then((r) => r.json())
      .then((d) => {
        const list: RepoRow[] = (d.repos || []);
        setRepos(list);
        const patch = proposeIssueMetaHeal({
          lifecycle: extras.meta!.lifecycle,
          state: extras.meta!.state,
          title: (threadMsg?.body || "").split("\n")[0] || "",
          assignee: extras.meta!.assignee,
          repoId: extras.meta!.repo_id,
          repos: list,
        });
        if (!patch) return;
        // persist the patch
      return writeChannelRow("thread_meta", {
          thread_id: threadId,
          channel_id: channelId,
          lifecycle: extras.meta!.lifecycle,
          state: extras.meta!.state,
          ...patch,
          updated_at: new Date().toISOString(),
        }).then(() => { setHealed(true); return extras.refresh(); }).catch(() => {});
      })
      .catch(() => {});
  }, [extras.meta, healed, threadId, channelId, threadMsg?.body]);

  // Default to the Work tab for approved plans so the execution handoff
  // is visible immediatly instead of stale challenge/conversation history.
  const meta: ThreadMetaRow | null = extras.meta;
  useEffect(() => {
    if (!meta) return;
    // Show the Work tab by default where it has the most value:
    // - Approved plans → execution handoff workspace
    // - Drafted coding threads → copied task list ready to run
    if (
      (meta.lifecycle === "planning" && meta.state === "accepted") ||
      (meta.lifecycle === "coding" && meta.state === "drafted")
    ) {
      setActiveTab("work");
    }
  }, [meta?.thread_id, meta?.lifecycle, meta?.state]);
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


  const archiveThread = async (action: "archive" | "unarchive") => {
    if (archiving) return;
    setArchiving(true);
    try {
      const response = await fetch("/api/channels/archive-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, channelId, action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Archive failed (${response.status})`);
      await extras.refresh();
      if (action === "archive") {
        router.push(`/channels/${channelId}`);
      }
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setArchiving(false);
    }
  };

  const dismissPromotion = () => {
    if (rawPromotion?.id) setDismissedPromotionId(rawPromotion.id);
  };

  const hasActiveReviewProposal = extras.interactions.some(
    (item) =>
      item.stage_id === currentState &&
      item.kind === "review.proposal" &&
      item.status === "active",
  );
  const attention = lifecyclePicked && meta
    ? deriveThreadAttention({
        lifecycle: lifecycleKey,
        state: currentState,
        assignee: meta.assignee,
        repoId: meta.repo_id,
        promotionStatus: promotion?.status || null,
        hasActiveReviewProposal,
      })
    : null;



  const issueHeader = lifecyclePicked && lifecycleKey === "issue" && meta
    ? (
      <IssueHeader
        threadId={threadId}
        meta={meta}
        forceEdit={focusTriage || (attention?.need === "triage" && !(meta.assignee || "").trim())}
        highlightMissing
        onSaved={async () => {
          setFocusTriage(false);
          setTriageAnchor((n) => n + 1);
          await extras.refresh();
        }}
      />
    )
    : null;

  // After a move, messages are filtered by URL channelId so threadMsg vanishes
  // until redirect; meta (polled by threadId) still tells us the canonical home.
  if (extras.meta?.channel_id && extras.meta.channel_id !== channelId) {
    return (
      <div className="min-h-screen bg-background pb-16 flex flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground animate-pulse">Redirecting to new channel…</p>
      </div>
    );
  }

  if (!channel || !threadMsg) {
    return (
      <div className="min-h-screen bg-background pb-16 flex flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground">Thread not found</p>
        <Link href={`/channels/${channelId}`} className="text-xs text-primary underline">
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

  const titleText = (threadMsg?.body || "").split("\n")[0] || `Thread ${threadId.slice(0, 8)}`;

  // Stage pills from workflow events (proto-10 visual pattern)
  const stagePills = useMemo(() => {
    const events = extras.workflowEvents;
    if (!events || events.length === 0) return [];
    const seen = new Set<string>();
    const stages: { label: string; done: boolean; active: boolean }[] = [];
    for (const ev of events) {
      const label = ev.to_state || ev.from_state || "";
      if (!label || seen.has(label)) continue;
      seen.add(label);
      const done = ev.event_type === "completed" || ev.event_type === "done";
      stages.push({ label, done, active: !done && ev.to_state === currentState });
    }
    if (currentState && !stages.some((s) => s.label === currentState)) {
      stages.push({ label: currentState, done: false, active: true });
    }
    return stages;
  }, [extras.workflowEvents, currentState]);

  // Proto-10 state → UiTone
  function stateTone(state: string | null | undefined): UiTone {
    if (!state) return "open";
    const s = state.toLowerCase();
    if (s === "in_progress" || s === "running") return "active";
    if (s === "review") return "wait";
    if (s === "blocked" || s === "failed" || s === "fail") return "danger";
    if (s === "resolved" || s === "shipped" || s === "verified") return "good";
    if (s === "approved") return "primary";
    if (s === "drafted") return "open";
    return "open";
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Proto-10 compact header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-3 py-2 pt-[env(safe-area-inset-top,0px)] backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center gap-2">
          <Link
            href={`/channels/${channelId}`}
            className="-ml-1 shrink-0 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            aria-label="Back to channel"
          >
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold truncate">{titleText}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              # {channel.name} · @{threadMsg.author} ·{" "}
              <StatusChip tone={stateTone(currentState)}>{currentState}</StatusChip>
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="shrink-0"
              render={
                <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" disabled={archiving} />
              }
            >
              ⋯
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isArchived ? (
                <>
                  <DropdownMenuItem onClick={() => setShowMoveDialog(true)}>Move…</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowArchiveConfirm(true)}>Archive</DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={() => { void archiveThread("unarchive"); }}>
                  {archiving ? "…" : "Restore"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Stage pills (proto-10 pattern) */}
        {stagePills.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {stagePills.map((s, i) => {
              const statusText = s.done ? "Completed" : s.active ? "In progress" : "Pending";
              return (
                <Tooltip key={i}>
                  <TooltipTrigger
                    render={
                      <span
                        className={cx(
                          "inline-flex text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                          s.active && "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border border-sky-300 dark:border-sky-700",
                          s.done && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700",
                          !s.active && !s.done && "bg-muted text-muted-foreground border border-border",
                        )}
                      />
                    }
                  >
                    {s.label}
                    {s.done ? " ✓" : s.active ? " →" : ""}
                  </TooltipTrigger>
                  <TooltipContent>{statusText}: {s.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto max-w-3xl space-y-3">
          {/* Each logical section wrapped in Card for proto-10 visual consistency */}
          {isArchived && (
            <Card size="sm">
              <CardContent>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {meta?.promoted_to
                    ? "This thread was promoted to a project and is archived (read-only)."
                    : "This thread is archived. It is hidden from Needs attention and channel lists."}
                </p>
                <div className="mt-1 flex flex-wrap gap-3">
                  {meta?.promoted_to && (
                    <Link
                      href="/projects"
                      className="inline-block text-[11px] font-medium text-amber-800 underline dark:text-amber-200"
                    >
                      Open Projects
                    </Link>
                  )}
                  <button
                    type="button"
                    disabled={archiving}
                    onClick={() => { void archiveThread("unarchive"); }}
                    className="text-[11px] font-medium text-amber-800 underline disabled:opacity-40 dark:text-amber-200"
                  >
                    Restore thread
                  </button>
                </div>
              </CardContent>
            </Card>
          )}
          {lifecyclePicked && meta && lc && (
            <WorkflowCockpit
              lifecycleKey={lifecycleKey}
              currentState={currentState}
              meta={meta}
              plans={plans}
              artifacts={extras.artifacts}
              steps={steps}
              activity={extras.activity}
              workflowEvents={extras.workflowEvents}
            />
          )}

          {lifecyclePicked && meta && lc && (
            <StageActionBar
              lifecycleKey={lifecycleKey}
              currentState={currentState}
              enabledWorkflows={enabledWorkflows}
              channelId={channelId}
              threadId={threadId}
              isArchived={isArchived}
              plans={plans}
              artifacts={extras.artifacts}
              steps={steps}
              onDone={async () => {
                await extras.refresh();
                requestAnimationFrame(() => {
                  document.getElementById("stage-action-bar")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  document.getElementById("active-stage-workspace")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                });
              }}
              onPromote={() => {
                openPromoteDialog();
              }}
              onScrollToExecution={
                (meta.lifecycle === "planning" && currentState === "accepted")
                  ? () => {
                      document.getElementById("execution-handoff-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  : undefined
              }
            />
          )}

          {!lifecyclePicked && (
            <Card size="sm">
              <CardContent>
                <div className="flex items-center gap-2">
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
                  <Select
                    value={null}
                    onValueChange={(value) => {
                      if (typeof value === "string") void handleLifecycleChange(value);
                    }}
                  >
                    <SelectTrigger size="sm" className="w-auto">
                      <SelectValue placeholder="Or pick…" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LIFECYCLES).map(([key, lcDef]) => (
                        <SelectItem key={key} value={key}>{lcDef.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}


          {attention && !isArchived && attention.need !== "triage" && (
            <DoNowBanner
              guide={attention}
              onCta={() => {
                document.getElementById("stage-action-bar")?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            />
          )}


          {/* Stage workspace stack: one expanded for current state, completed stages collapsed */}
          {lifecyclePicked && meta && !isArchived && (
            <ThreadStageStack
              lifecycleKey={lifecycleKey}
              currentState={currentState}
              meta={meta}
              channelId={channelId}
              threadId={threadId}
              enabledWorkflows={enabledWorkflows}
              steps={steps}
              plans={plans}
              artifacts={extras.artifacts}
              interactions={extras.interactions}
              scans={[]}
              candidates={[]}
              activity={extras.activity}
              onRefresh={async () => { await extras.refresh(); }}
            />
          )}

          <div id="issue-triage" key={triageAnchor}>
            {issueHeader}
          </div>


          <WorkRunsPanel threadId={threadId} compact />

          <ThreadTabs
            active={activeTab}
            onChange={setActiveTab}
            counts={{ work: workCount, artifacts: artifactCount, history: extras.workflowEvents.length }}
          />

          {activeTab === "conversation" && (
            <ThreadConversationTab
              threadMsg={threadMsg}
              replies={replies}
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
              threadId={threadId}
              promotionFailed={promotionFailed}
              showPromoteDialog={showPromoteDialog}
              onAcceptSuggestedLifecycle={() => { void handleLifecycleChange(suggestedLifecycle); }}
              onLifecycleChange={(nextLifecycle) => { void handleLifecycleChange(nextLifecycle); }}
              onResearchModeChange={(modeId) => { void handleResearchModeChange(modeId); }}
              onToggleWorkflow={(wfId) => { void toggleWorkflow(wfId); }}
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
              threadId={threadId}
              plans={plans}
              steps={steps}
              runEvents={runEvents}
              latestEvent={latestEvent}
              activityRunning={activityRunning}
              currentStateLabel={lc?.states[currentState]?.label || currentState}
              planningStage={lifecycleKey === "planning" && (currentState === "drafting" || currentState === "review")}
              onTogglePlanStatus={(plan) => { void togglePlanStatus(plan); }}
            />
          )}

          {activeTab === "artifacts" && (
            <ThreadArtifactsTab artifacts={latestArtifacts} />
          )}

          {activeTab === "history" && (
            <ThreadHistoryTab events={extras.workflowEvents} />
          )}

          <Dialog
            open={showPromoteDialog}
            onOpenChange={(open) => {
              if (!open) {
                setShowPromoteDialog(false);
                setPromoteError(null);
              } else {
                setShowPromoteDialog(true);
              }
            }}
          >
            <DialogContent className="sm:max-w-md" showCloseButton={!promoting}>
              <DialogHeader>
                <DialogTitle>{promotionFailed ? "Retry promote" : "Promote to Project"}</DialogTitle>
                <DialogDescription>
                  Scaffold a standalone AIWG project from this thread&apos;s messages, plans, and artifacts.
                  One-shot — no live sync back. You&apos;ll need to push to a remote manually.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label className="block text-[10px] text-muted-foreground">Destination path</label>
                <Input
                  type="text"
                  value={promoteDestination}
                  onChange={(e) => setPromoteDestination(e.target.value)}
                  placeholder="~/Projects/my-project"
                  className="text-xs"
                  disabled={promoting}
                />
                {promoteError && (
                  <p className="text-[10px] text-red-500">{promoteError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowPromoteDialog(false); setPromoteError(null); }}
                  disabled={promoting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => { void handlePromote(promoteDestination); }}
                  disabled={!promoteDestination.trim() || promoting}
                  className="border-emerald-500/30 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  {promoting ? "Promoting…" : "Promote"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
            <DialogContent className="sm:max-w-md" showCloseButton={!archiving}>
              <DialogHeader>
                <DialogTitle>Archive this thread?</DialogTitle>
                <DialogDescription>
                  It will leave Needs attention and channel lists. You can restore it later.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowArchiveConfirm(false)}
                  disabled={archiving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={archiving}
                  onClick={() => {
                    setShowArchiveConfirm(false);
                    void archiveThread("archive");
                  }}
                >
                  {archiving ? "Archiving…" : "Archive"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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

function IssueHeader({
  threadId,
  meta,
  forceEdit = false,
  highlightMissing = false,
  onSaved,
}: {
  threadId: string;
  meta: ThreadMetaRow;
  forceEdit?: boolean;
  highlightMissing?: boolean;
  onSaved?: () => void | Promise<void>;
}) {
  const [repoName, setRepoName] = useState<string | null>(null);
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [editing, setEditing] = useState(forceEdit);
  const [editPriority, setEditPriority] = useState(meta.priority || "none");
  const [editAssignee, setEditAssignee] = useState(meta.assignee || "");
  const [editRepoId, setEditRepoId] = useState(meta.repo_id || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (forceEdit) setEditing(true);
  }, [forceEdit]);

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.repos || []) as RepoRow[];
        setRepos(list);
        if (meta.repo_id) {
          const repo = list.find((r) => r.id === meta.repo_id);
          if (repo) {
            setRepoName(repo.name);
            setRepoPath(repo.path);
          }
        }
      })
      .catch(() => {});
  }, [meta.repo_id]);

  const missingOwner = !(meta.assignee || "").trim();
  const missingRepo = !meta.repo_id;

  const save = async () => {
    setSaving(true);
    try {
      await writeChannelRow("thread_meta", {
        thread_id: threadId,
        channel_id: meta.channel_id,
        priority: editPriority === "none" ? null : editPriority,
        assignee: editAssignee.trim() || null,
        repo_id: editRepoId || null,
        updated_at: new Date().toISOString(),
      });
      setEditing(false);
      await onSaved?.();
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
    <Card size="sm">
      <CardContent>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Issue setup</p>
        {!editing && (
          <button
            onClick={() => {
              setEditPriority(meta.priority || "none");
              setEditAssignee(meta.assignee || "");
              setEditRepoId(meta.repo_id || "");
              setEditing(true);
            }}
            className="text-[10px] font-medium text-amber-700 underline dark:text-amber-300"
          >
            Edit owner / repo
          </button>
        )}
      </div>

      {highlightMissing && missingOwner && !editing && (
        <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-300">
          Missing: owner. Tap edit to set it here.
        </p>
      )}
      {highlightMissing && missingRepo && !missingOwner && !editing && (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Link a repo when you're ready to run agents.
        </p>
      )}

      {editing ? (
        <div className="space-y-2">
          <label className="block text-[10px] text-muted-foreground">
            Owner
            <Input
              autoFocus={missingOwner || forceEdit}
              value={editAssignee}
              onChange={(e) => setEditAssignee(e.target.value)}
              placeholder="you"
              className={cx(
                "mt-0.5 h-8 text-xs",
                !editAssignee.trim() ? "border-amber-400 dark:border-amber-600" : "",
              )}
              disabled={saving}
            />
          </label>
          <label className="block text-[10px] text-muted-foreground">
            Repo
            <Select
              value={editRepoId || "__none__"}
              onValueChange={(value) => {
                setEditRepoId(typeof value === "string" && value !== "__none__" ? value : "");
              }}
              disabled={saving}
            >
              <SelectTrigger size="sm" className="mt-0.5 w-full">
                <SelectValue>
                  {editRepoId ? repos.find((repo) => repo.id === editRepoId)?.name || "Repo" : "Select repo…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select repo…</SelectItem>
                {repos.map((repo) => (
                  <SelectItem key={repo.id} value={repo.id}>
                    {repo.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block text-[10px] text-muted-foreground">
            Priority
            <Select
              value={editPriority}
              onValueChange={(value) => {
                if (typeof value === "string") setEditPriority(value);
              }}
              disabled={saving}
            >
              <SelectTrigger size="sm" className="mt-0.5 w-full">
                <SelectValue>{prioLabels[editPriority] || editPriority}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { void save(); }}
              disabled={saving || !editAssignee.trim()}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40 dark:bg-amber-400 dark:text-amber-950"
            >
              {saving ? "Saving…" : "Save and continue"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-md border border-border px-3 py-1.5 text-[11px] text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={prio === "urgent" ? "danger" : prio === "high" ? "wait" : prio === "medium" ? "active" : "neutral"}>
            {prioLabels[prio]}
          </StatusChip>
          <span className={cx("text-[11px]", missingOwner ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
            {meta.assignee ? `@${meta.assignee}` : "No owner"}
          </span>
          <span className={cx("text-[11px]", missingRepo ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
            {repoName ? `📁 ${repoName}` : "No repo"}
            {repoPath && <span className="ml-1 font-mono text-muted-foreground/60">{repoPath}</span>}
          </span>
        </div>
      )}
      </CardContent>
    </Card>
  );
}

