import Link from "next/link";
import { statusTone } from "./v2-utils";

export default function V2TududiTaskCard({
  projectUid,
  task,
}: {
  projectUid: string;
  task: {
    uid: string;
    name: string;
    status_label?: string;
    kind?: string;
    stage?: string | null;
    blocked?: boolean;
    repo?: string | null;
    outcome?: string | null;
  };
}) {
  return (
    <Link href={`/mobile-v2/projects/tududi/${projectUid}/${task.uid}`} className="block overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-2.5 transition hover:bg-[#fafafa]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-[var(--foreground)]">{task.name}</p>
            {task.kind && task.kind !== "task" && <span className="max-w-full rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">{task.kind}{task.stage ? `:${task.stage}` : ""}</span>}
            {task.blocked && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700">blocked</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-[var(--muted-foreground)]">
            {task.repo && <span>{task.repo}</span>}
            {task.outcome && <span>{task.outcome}</span>}
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusTone(task.status_label)}`}>{task.status_label || "open"}</span>
      </div>
    </Link>
  );
}
