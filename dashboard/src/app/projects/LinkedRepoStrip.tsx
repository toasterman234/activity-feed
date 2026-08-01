"use client";

import Link from "next/link";
import { ProjectWorkButton } from "./ProjectWorkButton";
import type { LinkableRepo } from "@/lib/tududiProjectLinks";

/** Thin bar under the tree when the selected Tududi project links a repo. */
export function LinkedRepoStrip({ repos }: { repos: LinkableRepo[] }) {
  if (!repos.length) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/80 bg-muted/20 px-2.5 py-2">
      {repos.map((repo) => (
        <div key={repo.id} className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Linked repo
            </p>
            <p className="truncate text-xs font-medium text-foreground">{repo.name}</p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">{repo.path}</p>
          </div>
          {typeof repo.active_thread_count === "number" && repo.active_thread_count > 0 && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {repo.active_thread_count} active
            </span>
          )}
          {repo.exists_on_disk === false && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              missing
            </span>
          )}
          <Link
            href={`/projects/${repo.id}`}
            className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/40"
          >
            Open
          </Link>
          <ProjectWorkButton repoId={repo.id} />
        </div>
      ))}
    </div>
  );
}
