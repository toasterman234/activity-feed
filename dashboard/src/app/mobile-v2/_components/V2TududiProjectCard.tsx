import Link from "next/link";
import { FolderTree, Link2 } from "lucide-react";
import type { LinkableRepo } from "@/lib/tududiProjectLinks";

export default function V2TududiProjectCard({
  project,
  active,
  counts,
  linkedRepos,
}: {
  project: { uid: string; name: string; description?: string | null };
  active?: boolean;
  counts?: { open?: number; done?: number; decisions?: number; forks?: number; stages?: number };
  linkedRepos?: LinkableRepo[];
}) {
  return (
    <Link
      href={`/mobile-v2/projects/tududi/${project.uid}`}
      className={`block overflow-hidden rounded-2xl border p-3 transition ${active ? "border-[#111318] bg-[#f6f6f7]" : "border-[var(--border)] bg-white hover:bg-[#fafafa]"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--foreground)]">
            <FolderTree className="size-4 text-[var(--primary)]" />
            <p className="truncate text-sm font-semibold">{project.name}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-[var(--muted-foreground)] sm:text-sm">{project.description || "No description"}</p>
          <p className="mt-2 truncate font-mono text-[10px] text-[var(--muted-foreground)]">{project.uid}</p>
        </div>
        {typeof counts?.open === "number" && <span className="shrink-0 rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">{counts.open} open</span>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[11px]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-2 py-1.5"><div className="text-[9px] uppercase tracking-wide text-[var(--muted-foreground)]">Open</div><div className="mt-0.5 font-semibold text-[var(--foreground)]">{counts?.open ?? "—"}</div></div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-2 py-1.5"><div className="text-[9px] uppercase tracking-wide text-[var(--muted-foreground)]">Done</div><div className="mt-0.5 font-semibold text-[var(--foreground)]">{counts?.done ?? "—"}</div></div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-2 py-1.5"><div className="text-[9px] uppercase tracking-wide text-[var(--muted-foreground)]">Decisions</div><div className="mt-0.5 font-semibold text-[var(--foreground)]">{counts?.decisions ?? "—"}</div></div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-2 py-1.5"><div className="text-[9px] uppercase tracking-wide text-[var(--muted-foreground)]">Stages</div><div className="mt-0.5 font-semibold text-[var(--foreground)]">{counts?.stages ?? "—"}</div></div>
      </div>

      {!!linkedRepos?.length && (
        <div className="mt-3 flex flex-wrap gap-1 text-[10px]">
          {linkedRepos.slice(0, 3).map((repo) => (
            <span key={repo.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-[var(--muted-foreground)]"><Link2 className="size-3 shrink-0" /> <span className="truncate">{repo.name}</span></span>
          ))}
        </div>
      )}
    </Link>
  );
}
