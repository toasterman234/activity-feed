"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ThreadPlanRow } from "./shapes";

type Repo = {
  id: string;
  name: string;
  path: string;
  git_remote: string | null;
  exists_on_disk: boolean;
  active_thread_count: number;
};
type Execution = { target_thread_id: string; state: string; title: string; url: string; assignee: string | null };
type VerificationProfile = {
  repo_id: string | null;
  commands: Array<{ key: string; label: string; required: boolean }> | null;
  enabled: boolean | null;
};

function planList(value: string): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function ExecutionHandoffWorkspace({
  threadId,
  channelId,
  plans,
  onRefresh,
}: {
  threadId: string;
  channelId: string;
  plans: ThreadPlanRow[];
  onRefresh: () => Promise<void>;
}) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoId, setRepoId] = useState("");
  const [linkedRepoId, setLinkedRepoId] = useState<string | null>(null);
  const [agent, setAgent] = useState("pi");
  const [authority, setAuthority] = useState("implement");
  const [busy, setBusy] = useState<"link" | "start" | "promote" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [newProjectPath, setNewProjectPath] = useState("");
  const [promotionStarted, setPromotionStarted] = useState(false);
  const [verification, setVerification] = useState<VerificationProfile | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/repos", { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/channels/thread-extras?threadId=${encodeURIComponent(threadId)}`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/channels/execution-handoff?threadId=${encodeURIComponent(threadId)}`, { cache: "no-store" }).then((response) => response.json()),
    ]).then(([repoData, threadData, executionData]) => {
      setRepos(repoData.repos || []);
      setExecutions(executionData.executions || []);
      const currentRepoId = String(threadData.meta?.repo_id || "");
      setLinkedRepoId(currentRepoId || null);
      if (currentRepoId) setRepoId(currentRepoId);
    }).catch(() => setError("Projects could not be loaded"));
  }, [threadId]);

  const selected = useMemo(() => repos.find((repo) => repo.id === repoId) || null, [repos, repoId]);
  const orderedPlans = useMemo(
    () => [...plans].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [plans],
  );
  useEffect(() => {
    if (!repoId) {
      setVerification(null);
      return;
    }
    fetch(`/api/repos/verification-profile?repoId=${encodeURIComponent(repoId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setVerification(data.profile || null))
      .catch(() => setVerification(null));
  }, [repoId]);

  const submit = async (action: "link" | "start") => {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/channels/execution-handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, threadId, channelId, repoId, agent, authority }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      if (data.url) setCreatedUrl(String(data.url));
      if (action === "link") setLinkedRepoId(repoId);
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const promote = async () => {
    const destinationPath = newProjectPath.trim();
    if (!destinationPath) return;
    setBusy("promote");
    setError(null);
    try {
      const response = await fetch("/api/channels/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, channelId, destinationPath }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) throw new Error(data.error || `Request failed (${response.status})`);
      setPromotionStarted(true);
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-emerald-300 bg-white p-3 shadow-[0_10px_30px_rgba(24,24,27,0.05)] dark:border-emerald-800 dark:bg-zinc-900">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Approved · choose what happens next</p>
      <h3 className="mt-1 text-base font-semibold">Hand this plan into execution</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        Attach the plan to the project that owns the work. Starting execution creates a linked Coding task with these {orderedPlans.length} approved steps; this planning record stays unchanged.
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
          Existing project or repository
          <select value={repoId} onChange={(event) => setRepoId(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700">
            <option value="">Choose a project…</option>
            {repos.map((repo) => <option key={repo.id} value={repo.id}>{repo.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
          Who should execute?
          <select value={agent} onChange={(event) => setAgent(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700">
            <option value="pi">Pi</option>
            <option value="codex">Codex</option>
            <option value="claude">Claude</option>
            <option value="you">Me / manual</option>
          </select>
        </label>
      </div>
      <label className="mt-3 block text-xs font-medium text-zinc-700 dark:text-zinc-200">
        Execution authority
        <select value={authority} onChange={(event) => setAuthority(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700">
          <option value="prepare">Prepare changes only</option>
          <option value="implement">Implement and verify — no commit or deploy</option>
          <option value="commit">Implement, verify, and commit</option>
          <option value="deploy">Implement, verify, commit, and deploy at the deployment gate</option>
        </select>
      </label>

      {selected && (
        <div className={`mt-3 rounded-lg border p-2 text-xs ${selected.exists_on_disk ? "border-zinc-200 dark:border-zinc-800" : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"}`}>
          <p className="font-medium">{selected.name}</p>
          <p className="mt-0.5 break-all font-mono text-[10px] text-zinc-500">{selected.path}</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {selected.exists_on_disk ? `${selected.active_thread_count || 0} active work tasks` : "Repository path is not available on the execution host. Link is allowed, but execution cannot start here yet."}
          </p>
          {selected.exists_on_disk && (
            <p className={`mt-1 text-[11px] ${verification?.repo_id && verification.enabled !== false && verification.commands?.length ? "text-emerald-600" : "text-amber-600"}`}>
              {verification?.repo_id && verification.enabled !== false && verification.commands?.length
                ? `Verification ready: ${verification.commands.filter((command) => command.required).map((command) => command.label).join(", ")}`
                : "Verification checks are not configured yet; the execution task can be created, but its Verify stage will require a repository profile."}
            </p>
          )}
        </div>
      )}

      <details className="mt-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
        <summary className="cursor-pointer text-xs font-medium">Approved plan being handed off · {orderedPlans.length} tasks</summary>
        <ol className="mt-2 space-y-2">
          {orderedPlans.map((plan, index) => {
            const criteria = planList(plan.acceptance_criteria);
            const dependencies = planList(plan.dependencies);
            return (
              <li key={plan.id} className="rounded-md border border-zinc-100 p-2 text-[11px] leading-5 dark:border-zinc-800">
                <div className="flex gap-2"><span className="font-mono text-zinc-400">{index + 1}.</span><span className="font-medium">{plan.title}</span></div>
                {criteria.length > 0 && (
                  <ul className="mt-1 pl-6 text-zinc-500">
                    {criteria.map((item) => <li key={item}>✓ {item}</li>)}
                  </ul>
                )}
                {dependencies.length > 0 && <p className="mt-1 pl-6 text-[10px] text-zinc-400">Depends on steps {dependencies.join(", ")}</p>}
              </li>
            );
          })}
        </ol>
      </details>

      {createdUrl ? (
        <Link href={createdUrl} className="mt-3 inline-flex rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
          Open execution task →
        </Link>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={!repoId || busy !== null || !selected?.exists_on_disk} onClick={() => { void submit("start"); }} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy === "start" ? "Creating…" : "Create execution task"}
          </button>
          <button disabled={!repoId || busy !== null || linkedRepoId === repoId} onClick={() => { void submit("link"); }} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium disabled:opacity-40 dark:border-zinc-700">
            {busy === "link" ? "Linking…" : linkedRepoId === repoId ? "Linked to this project ✓" : "Link plan only"}
          </button>
          <Link href="/projects" className="rounded-lg px-2 py-2 text-xs text-zinc-500 underline">Manage projects</Link>
        </div>
      )}
      {executions.length > 0 && !createdUrl && (
        <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <p className="font-mono text-[9px] uppercase tracking-wide text-zinc-400">Linked execution</p>
          {executions.map((execution) => (
            <Link key={execution.target_thread_id} href={execution.url} className="mt-2 flex items-center justify-between rounded-lg border border-zinc-200 p-2 text-xs dark:border-zinc-800">
              <span className="min-w-0 truncate font-medium">{execution.title}</span>
              <span className="ml-2 shrink-0 text-zinc-400">{execution.state} →</span>
            </Link>
          ))}
        </div>
      )}
      <details className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <summary className="cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-300">Need a new standalone project instead?</summary>
        <p className="mt-2 text-[11px] leading-5 text-zinc-500">
          This scaffolds a new project from the approved plan and archives this planning task. Use it only when the work does not belong to an existing project.
        </p>
        {promotionStarted ? (
          <p className="mt-2 text-xs font-medium text-emerald-600">Project creation started. You can follow it from Projects.</p>
        ) : (
          <div className="mt-2 flex gap-2">
            <input value={newProjectPath} onChange={(event) => setNewProjectPath(event.target.value)} placeholder="/home/ubuntu/Projects/new-project" className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
            <button disabled={!newProjectPath.trim() || busy !== null} onClick={() => { void promote(); }} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium disabled:opacity-40 dark:border-zinc-700">
              {busy === "promote" ? "Creating…" : "Create project"}
            </button>
          </div>
        )}
      </details>
      <p className="mt-3 text-[11px] text-zinc-400">Not ready to execute? Leave the approved plan here. Nothing starts until you explicitly create an execution task or project.</p>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
