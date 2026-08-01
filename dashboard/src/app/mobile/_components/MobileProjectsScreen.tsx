"use client";

import Link from "next/link";
import { useMobileProjects } from "../_hooks/useMobileProjects";

export default function MobileProjectsScreen() {
  const { repos, loading, error, refresh } = useMobileProjects();

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 pt-1">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">Repos</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Projects</h1>
        </div>
        <button onClick={() => void refresh()} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300">Refresh</button>
      </div>

      {error && <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</div>}

      <div className="space-y-3">
        {repos.map((repo) => (
          <Link key={repo.id} href={`/projects/${repo.id}`} className="block rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-medium text-zinc-100">{repo.name}</h2>
                <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{repo.path}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${repo.active_thread_count > 0 ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-zinc-300"}`}>
                {repo.active_thread_count > 0 ? `${repo.active_thread_count} active` : "idle"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-zinc-400">
              <span className="rounded-full border border-white/10 px-2 py-1">{repo.scaffold_detected ? "scaffolded" : "unstructured"}</span>
              <span className="rounded-full border border-white/10 px-2 py-1">{repo.archived_thread_count} archived</span>
              {!repo.exists_on_disk && <span className="rounded-full border border-amber-300/30 px-2 py-1 text-amber-200">missing local path</span>}
            </div>
          </Link>
        ))}
        {!loading && repos.length === 0 && <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 text-sm text-zinc-400">No projects available.</div>}
      </div>
    </div>
  );
}
