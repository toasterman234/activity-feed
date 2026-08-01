"use client";

import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  StatusChip,
  Button,
} from "@/components/ui";
import { extractAdPointer, kindBadgeClass } from "@/lib/tududiConventions";

export type TududiTaskDetail = {
  uid: string;
  name: string;
  status_label?: string;
  note?: string | null;
  kind?: string;
  stage?: string | null;
  path?: string | null;
  outcome?: string | null;
  blocked?: boolean;
  repo?: string | null;
};

function pointerHref(type: string, id: string): string | null {
  if (type === "thread") return `/channels/default/${id}`;
  if (type === "repo") return `/projects/${id}`;
  if (type === "run") return `/runs?run=${id}`;
  if (type === "channel") return `/channels/${id}`;
  return null;
}

function collectPointers(note: string): Array<{ type: string; id: string; href: string | null }> {
  const out: Array<{ type: string; id: string; href: string | null }> = [];
  const seen = new Set<string>();
  for (const m of note.matchAll(/\bad:(thread|repo|channel|run):([a-zA-Z0-9_-]+)/g)) {
    const key = `${m[1]}:${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: m[1], id: m[2], href: pointerHref(m[1], m[2]) });
  }
  const single = extractAdPointer(note);
  if (single) {
    const key = `${single.type}:${single.id}`;
    if (!seen.has(key)) {
      out.push({ type: single.type, id: single.id, href: pointerHref(single.type, single.id) });
    }
  }
  return out;
}

export function TududiTaskSheet({
  task,
  projectName,
  open,
  busy,
  onOpenChange,
  onSetStatus,
}: {
  task: TududiTaskDetail | null;
  projectName?: string | null;
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSetStatus?: (uid: string, status: string) => void;
}) {
  const note = String(task?.note || "");
  const pointers = note ? collectPointers(note) : [];
  const kind = task?.kind || "task";
  const done = (task?.status_label || "") === "done";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto pt-14 pb-24">
        {task ? (
          <>
            <SheetHeader className="px-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {kind !== "task" ? (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${kindBadgeClass(kind)}`}
                  >
                    {kind}
                    {task.stage ? `:${task.stage}` : ""}
                  </span>
                ) : null}
                {task.blocked ? <StatusChip tone="danger">blocked</StatusChip> : null}
                <StatusChip tone={done ? "good" : "open"}>
                  {task.status_label || "open"}
                </StatusChip>
              </div>
              <SheetTitle className="text-base leading-snug">{task.name}</SheetTitle>
              <SheetDescription>
                {projectName ? `${projectName} · ` : ""}
                <span className="font-mono text-[11px]">{task.uid}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4">
              <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                {task.stage ? (
                  <>
                    <dt className="text-muted-foreground">Stage</dt>
                    <dd className="truncate font-medium">{task.stage}</dd>
                  </>
                ) : null}
                {task.path ? (
                  <>
                    <dt className="text-muted-foreground">Path</dt>
                    <dd className="truncate font-mono text-[11px]">{task.path}</dd>
                  </>
                ) : null}
                {task.outcome ? (
                  <>
                    <dt className="text-muted-foreground">Outcome</dt>
                    <dd className="truncate">{task.outcome}</dd>
                  </>
                ) : null}
                {task.repo ? (
                  <>
                    <dt className="text-muted-foreground">Repo</dt>
                    <dd className="truncate font-mono text-[11px]">{task.repo}</dd>
                  </>
                ) : null}
              </dl>

              {pointers.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Links
                  </h4>
                  <ul className="space-y-1">
                    {pointers.map((p) => (
                      <li key={`${p.type}:${p.id}`}>
                        {p.href ? (
                          <Link
                            href={p.href}
                            className="text-xs text-primary hover:underline"
                            onClick={() => onOpenChange(false)}
                          >
                            {p.type}:{p.id} →
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {p.type}:{p.id}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Note
                </h4>
                {note.trim() ? (
                  <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-2.5 font-sans text-xs leading-relaxed text-foreground">
                    {note}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">No note.</p>
                )}
              </div>
            </div>

            <SheetFooter className="gap-2">
              {onSetStatus ? (
                <Button
                  type="button"
                  variant={done ? "outline" : "default"}
                  disabled={busy}
                  onClick={() =>
                    onSetStatus(task.uid, done ? "not_started" : "done")
                  }
                >
                  {done ? "Reopen" : "Mark done"}
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </SheetFooter>
          </>
        ) : (
          <SheetHeader>
            <SheetTitle>Item</SheetTitle>
            <SheetDescription>Nothing selected.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}
