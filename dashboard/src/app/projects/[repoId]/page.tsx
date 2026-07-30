"use client";

import Link from "next/link";
import { use, useEffect, useState, type ReactNode } from "react";
import { ProjectQuickWorkComposer } from "../ProjectQuickWorkComposer";
import { ProjectWorkButton } from "../ProjectWorkButton";

type Doc = {
  path: string;
  name: string;
  updated_at: string;
  content: string;
};

type ProjectDetail = {
  repo: {
    id: string;
    name: string;
    path: string;
    git_remote: string | null;
    created_at: string;
    exists_on_disk: boolean;
    scaffold_detected: boolean;
  };
  source_thread: {
    thread_id: string;
    channel_id: string;
    lifecycle: string;
    state: string;
    updated_at: string;
    title: string;
  } | null;
  active_thread: {
    thread_id: string;
    channel_id: string;
    lifecycle: string;
    state: string;
    updated_at: string;
    title: string;
  } | null;
  threads: {
    thread_id: string;
    channel_id: string;
    lifecycle: string;
    state: string;
    archived_at: string | null;
    updated_at: string;
    title: string;
  }[];
  artifacts: {
    id: string;
    thread_id: string;
    title: string;
    kind: string;
    version: number;
    created_at: string;
    channel_id: string;
    thread_title: string;
  }[];
  promotions: {
    id: string;
    thread_id: string;
    repo_path: string | null;
    status: string;
    error_detail: string | null;
    progress: string | null;
    created_at: string;
    completed_at: string | null;
    channel_id: string;
    thread_title: string;
  }[];
  current_run: {
    thread_id: string;
    step_label: string;
    detail: string | null;
    created_at: string;
    channel_id: string;
    thread_title: string;
  } | null;
  project_phase: {
    phase: string;
    label: string;
    reason: string;
    recommended_thread_lifecycle: string;
    recommended_action: string;
  };
  aiwg: {
    docs: Doc[];
    intake_docs: Doc[];
  };
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function ProjectDetailPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = use(params);
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/projects/detail?repoId=${encodeURIComponent(repoId)}`, { cache: "no-store" });
        const next = await res.json();
        if (!res.ok) throw new Error(next.error || `HTTP ${res.status}`);
        if (!active) return;
        setData(next);
        setErr(null);
      } catch (e) {
        if (!active) return;
        setErr(String(e));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [repoId]);

  if (loading) {
    return <Shell><p className="text-sm text-zinc-400">Loading project…</p></Shell>;
  }

  if (err || !data) {
    return <Shell><p className="text-sm text-red-500">{err || "Project not found"}</p></Shell>;
  }

  const { repo, source_thread: source, active_thread: activeThread, threads, artifacts, promotions, project_phase: projectPhase, current_run: currentRun, aiwg } = data;
  const activeThreads = threads.filter((thread) => !thread.archived_at);
  const archivedThreads = threads.filter((thread) => !!thread.archived_at);

  return (
    <Shell>
      <div className="space-y-4">
        <section className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{repo.name}</h1>
              <p className="mt-1 break-all font-mono text-[11px] text-zinc-500">{repo.path}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                <span className={`rounded px-1.5 py-0.5 ${repo.exists_on_disk ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                  {repo.exists_on_disk ? "repo exists on host" : "repo path missing on host"}
                </span>
                <span className={`rounded px-1.5 py-0.5 ${repo.scaffold_detected ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
                  {repo.scaffold_detected ? "AIWG scaffold detected" : "No AIWG scaffold detected"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ProjectWorkButton repoId={repo.id} label={activeThread ? "Resume work" : "Work here"} />
              <ProjectWorkButton
                repoId={repo.id}
                label="New work thread"
                forceNew={true}
                className="rounded border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
              />
              {activeThread && (
                <Link
                  href={`/channels/${activeThread.channel_id}/${activeThread.thread_id}`}
                  className="rounded border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Open active thread
                </Link>
              )}
              {source && (
                <Link
                  href={`/channels/${source.channel_id}/${source.thread_id}`}
                  className="rounded border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Open source thread
                </Link>
              )}
              {repo.git_remote && (
                <a
                  href={repo.git_remote}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Remote
                </a>
              )}
            </div>
          </div>

          <dl className="mt-3 grid gap-2 text-[11px] text-zinc-600 dark:text-zinc-300 sm:grid-cols-2">
            <Meta label="Created" value={fmt(repo.created_at)} />
            <Meta label="Project phase" value={projectPhase.label} />
            <Meta label="Active thread" value={activeThread ? activeThread.title : "None"} />
            <Meta label="Recommended next thread" value={projectPhase.recommended_thread_lifecycle} />
            <Meta label="Source thread" value={source ? source.title : "None"} />
            <Meta label="Promotion runs" value={String(promotions.length)} />
          </dl>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Project phase</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {projectPhase.label}
            </span>
            <span>{projectPhase.reason}</span>
          </div>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
            Recommended next move: <span className="font-medium">{projectPhase.recommended_action}</span>
          </p>
        </section>

        <ProjectQuickWorkComposer repoId={repo.id} hasActiveThread={!!activeThread} />

        <section className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Current agent status</h2>
          {currentRun ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                running
              </span>
              <span>{currentRun.step_label}</span>
              <span>·</span>
              <Link href={`/channels/${currentRun.channel_id}/${currentRun.thread_id}`} className="text-blue-600 dark:text-blue-400">
                {currentRun.thread_title}
              </Link>
              <span>· {fmt(currentRun.created_at)}</span>
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-zinc-400">No agent currently running for this project.</p>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="AIWG docs" subtitle="Scaffolded project context from disk">
            {aiwg.docs.length === 0 ? (
              <Empty text="No AIWG docs found on disk." />
            ) : (
              <div className="space-y-3">
                {aiwg.docs.map((doc) => (
                  <DocCard key={doc.path} doc={doc} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Intake docs" subtitle=".aiwg/intake/*">
            {aiwg.intake_docs.length === 0 ? (
              <Empty text="No intake docs found yet." />
            ) : (
              <div className="space-y-3">
                {aiwg.intake_docs.map((doc) => (
                  <DocCard key={doc.path} doc={doc} />
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title={`Work threads (${threads.length})`} subtitle="All repo-bound threads">
            {threads.length === 0 ? (
              <Empty text="No threads linked to this repo yet." />
            ) : (
              <div className="space-y-4">
                <ThreadGroup
                  title={`Active (${activeThreads.length})`}
                  threads={activeThreads}
                  primaryThreadId={activeThread?.thread_id || null}
                  repoId={repo.id}
                  showActions={true}
                />
                <ThreadGroup
                  title={`Archived (${archivedThreads.length})`}
                  threads={archivedThreads}
                  emptyText="No archived threads."
                  primaryThreadId={activeThread?.thread_id || null}
                  repoId={repo.id}
                />
              </div>
            )}
          </Panel>

          <Panel title={`Thread artifacts (${artifacts.length})`} subtitle="Artifacts emitted from repo-bound threads">
            {artifacts.length === 0 ? (
              <Empty text="No thread artifacts yet." />
            ) : (
              <ul className="space-y-2">
                {artifacts.map((artifact) => (
                  <li key={artifact.id} className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{artifact.title}</p>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          {artifact.kind} · v{artifact.version} · from {artifact.thread_title}
                        </p>
                      </div>
                      <Link href={`/channels/${artifact.channel_id}/${artifact.thread_id}`} className="text-[10px] text-blue-600 dark:text-blue-400">
                        Open thread
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>

        <Panel title={`Promotion history (${promotions.length})`} subtitle="Provenance from source threads">
          {promotions.length === 0 ? (
            <Empty text="No promotion history for this repo." />
          ) : (
            <ul className="space-y-2">
              {promotions.map((promotion) => (
                <li key={promotion.id} className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/channels/${promotion.channel_id}/${promotion.thread_id}`} className="text-sm font-medium text-zinc-800 hover:underline dark:text-zinc-100">
                        {promotion.thread_title}
                      </Link>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        {promotion.status}
                        {promotion.repo_path ? ` · ${promotion.repo_path}` : ""}
                      </p>
                      {promotion.error_detail && (
                        <p className="mt-1 text-[10px] text-red-500">{promotion.error_detail}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400">{fmt(promotion.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2">
          <div>
            <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Project</h1>
            <p className="text-[10px] text-zinc-400">AIWG-aware project view. Work still happens in threads.</p>
          </div>
          <Link href="/projects" className="text-xs text-blue-600 dark:text-blue-400">
            Projects
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-3">{children}</main>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[10px] text-zinc-400">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-400">{label}</dt>
      <dd className="mt-0.5 text-zinc-700 dark:text-zinc-200">{value}</dd>
    </div>
  );
}

function DocCard({ doc }: { doc: Doc }) {
  return (
    <details className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
      <summary className="cursor-pointer list-none text-sm font-medium text-zinc-800 dark:text-zinc-100">
        {doc.name}
        <span className="ml-2 text-[10px] font-normal text-zinc-400">{fmt(doc.updated_at)}</span>
      </summary>
      <p className="mt-1 break-all font-mono text-[10px] text-zinc-400">{doc.path}</p>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 text-[11px] text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">{doc.content}</pre>
    </details>
  );
}

function ThreadGroup({
  title,
  threads,
  emptyText = "None",
  primaryThreadId,
  repoId,
  showActions = false,
}: {
  title: string;
  threads: ProjectDetail["threads"];
  emptyText?: string;
  primaryThreadId: string | null;
  repoId: string;
  showActions?: boolean;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-400">{title}</h3>
      {threads.length === 0 ? (
        <Empty text={emptyText} />
      ) : (
        <ul className="space-y-2">
          {threads.map((thread) => {
            const isPrimary = thread.thread_id === primaryThreadId;
            return (
              <li key={thread.thread_id} className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/channels/${thread.channel_id}/${thread.thread_id}`} className="text-sm font-medium text-zinc-800 hover:underline dark:text-zinc-100">
                        {thread.title}
                      </Link>
                      {isPrimary && (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          primary
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {thread.lifecycle} · {thread.state}{thread.archived_at ? " · archived" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 space-y-1 text-right">
                    <span className="block text-[10px] text-zinc-400">{fmt(thread.updated_at)}</span>
                    {showActions && (
                      <div className="flex flex-wrap justify-end gap-1">
                        {!isPrimary && (
                          <ThreadActionButton
                            repoId={repoId}
                            threadId={thread.thread_id}
                            action="makePrimary"
                            label="Make primary"
                          />
                        )}
                        <ThreadActionButton
                          repoId={repoId}
                          threadId={thread.thread_id}
                          action="archive"
                          label="Archive"
                          confirmMessage="Archive this work thread?"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ThreadActionButton({
  repoId,
  threadId,
  action,
  label,
  confirmMessage,
}: {
  repoId: string;
  threadId: string;
  action: "archive" | "makePrimary";
  label: string;
  confirmMessage?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (confirmMessage && !window.confirm(confirmMessage)) return;
          setBusy(true);
          setError(null);
          void fetch("/api/projects/thread-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ repoId, threadId, action }),
          })
            .then(async (res) => {
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
              window.location.reload();
            })
            .catch((e) => {
              setError(String(e));
              setBusy(false);
            });
        }}
        className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
      >
        {busy ? "…" : label}
      </button>
      {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-zinc-400">{text}</p>;
}
