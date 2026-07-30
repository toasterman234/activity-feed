"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProjectWorkButton } from "./ProjectWorkButton";

type Repo = {
  id: string;
  name: string;
  path: string;
  git_remote: string | null;
  created_at: string;
  source_thread_id: string | null;
  source_channel_id: string | null;
  from_promotion: boolean;
  active_thread_count: number;
  archived_thread_count: number;
  exists_on_disk: boolean;
  scaffold_detected: boolean;
};

export default function ProjectsPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRepos(data.repos || []);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return repos;
    return repos.filter((r) =>
      r.name.toLowerCase().includes(needle) ||
      r.path.toLowerCase().includes(needle),
    );
  }, [repos, q]);

  const promoted = filtered.filter((r) => r.from_promotion);
  const other = filtered.filter((r) => !r.from_promotion);
  const totals = useMemo(() => ({
    repos: filtered.length,
    promoted: promoted.length,
    activeThreads: filtered.reduce((sum, repo) => sum + Number(repo.active_thread_count || 0), 0),
    aiwgProjects: filtered.filter((repo) => repo.scaffold_detected).length,
  }), [filtered, promoted]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2">
          <div>
            <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Projects</h1>
            <p className="text-[10px] text-zinc-400">
              Open project shows AIWG context. Work happens in repo-bound threads.
            </p>
          </div>
          <Link href="/channels" className="text-xs text-blue-600 dark:text-blue-400">
            Channels
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-3 py-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter projects…"
          className="w-full rounded-md border border-zinc-200 bg-card px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        />

        {!loading && !err && filtered.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500">
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800 dark:text-zinc-300">{totals.repos} repos</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800 dark:text-zinc-300">{totals.promoted} promoted</span>
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{totals.activeThreads} active work threads</span>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300">{totals.aiwgProjects} AIWG scaffolded</span>
            </div>
          </div>
        )}

        {loading && <p className="py-8 text-center text-sm text-zinc-400">Loading…</p>}
        {err && <p className="text-sm text-red-500">{err}</p>}

        {!loading && !err && filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-zinc-400">
            No projects yet. Promote a thread to create one.
          </p>
        )}

        {promoted.length > 0 && (
          <section>
            <h2 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              From promotions ({promoted.length})
            </h2>
            <ul className="space-y-2">
              {promoted.map((r) => (
                <ProjectCard key={r.id} repo={r} />
              ))}
            </ul>
          </section>
        )}

        {other.length > 0 && (
          <section>
            <h2 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Registered repos ({other.length})
            </h2>
            <ul className="space-y-2">
              {other.map((r) => (
                <ProjectCard key={r.id} repo={r} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function ProjectCard({ repo }: { repo: Repo }) {
  return (
    <li className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {repo.name}
          </p>
          <p className="mt-0.5 break-all font-mono text-[10px] text-zinc-400">{repo.path}</p>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-zinc-500">
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {repo.active_thread_count} active
            </span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800 dark:text-zinc-300">
              {repo.archived_thread_count} archived
            </span>
            <span className={`rounded px-1.5 py-0.5 ${repo.scaffold_detected ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
              {repo.scaffold_detected ? "AIWG" : "No AIWG"}
            </span>
            {!repo.exists_on_disk && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                missing on host
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          {repo.from_promotion && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              promoted
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          href={`/projects/${repo.id}`}
          className="rounded border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
        >
          Open project
        </Link>
        <ProjectWorkButton repoId={repo.id} />
        <ProjectWorkButton
          repoId={repo.id}
          label="New work thread"
          forceNew={true}
          className="rounded border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
        />
        {repo.source_thread_id && repo.source_channel_id && (
          <Link
            href={`/channels/${repo.source_channel_id}/${repo.source_thread_id}`}
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
    </li>
  );
}
