"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Link2, RefreshCcw } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useV2TududiOverview } from "../_hooks/useV2TududiOverview";
import { statusTone } from "./v2-utils";

function pointerHref(type: string, id: string): string | null {
  if (type === "repo") return `/mobile-v2/projects/${id}`;
  if (type === "channel") return `/mobile-v2/inbox/${id}`;
  if (type === "run") return `/runs?run=${id}`;
  if (type === "thread") return null;
  return null;
}

function collectPointers(note: string): Array<{ type: string; id: string; href: string | null }> {
  const out: Array<{ type: string; id: string; href: string | null }> = [];
  const seen = new Set<string>();
  for (const match of note.matchAll(/\bad:(thread|repo|channel|run):([a-zA-Z0-9_-]+)/g)) {
    const key = `${match[1]}:${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: match[1], id: match[2], href: pointerHref(match[1], match[2]) });
  }
  return out;
}

export default function TududiTaskDetailView({ projectUid, taskUid }: { projectUid: string; taskUid: string }) {
  const { selectedData, loading, error, refresh } = useV2TududiOverview(projectUid);
  const task = useMemo(() => (selectedData?.tasks || []).find((item) => item.uid === taskUid) || null, [selectedData?.tasks, taskUid]);
  const note = String(task?.note || "");
  const pointers = collectPointers(note);

  const setStatus = async (status: string) => {
    await fetch("/api/tududi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_status", uid: taskUid, status }),
    });
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/mobile-v2/projects/tududi/${projectUid}`} className="inline-flex items-center gap-2 text-sm text-[var(--primary)]"><ArrowLeft className="size-4" /> Back to project</Link>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]">{task?.name || taskUid}</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Tududi task detail inside mobile-v2.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}><RefreshCcw className="size-4" /> Refresh</Button>
          {selectedData?.public_base && <a href={selectedData.public_base} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--foreground)]">Tududi <ExternalLink className="ml-2 size-4 text-[var(--primary)]" /></a>}
        </div>
      </div>

      {error && <div className="v2-surface p-4 text-sm text-[var(--destructive)]">{error}</div>}

      <Card size="sm" className="v2-surface py-3">
        <CardContent className="flex flex-wrap items-center gap-2">
          {task?.kind && task.kind !== "task" && <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">{task.kind}{task.stage ? `:${task.stage}` : ""}</span>}
          <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${statusTone(task?.status_label)}`}>{task?.status_label || "open"}</span>
          {task?.blocked && <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs uppercase tracking-wide text-amber-700">blocked</span>}
          {task?.repo && <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--muted-foreground)]">{task.repo}</span>}
        </CardContent>
      </Card>

      <Card size="sm" className="v2-surface py-3">
        <CardHeader className="pb-2"><CardTitle className="text-base">Actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void setStatus(task?.status_label === "done" ? "not_started" : "done")}>{task?.status_label === "done" ? "Reopen" : "Mark done"}</Button>
        </CardContent>
      </Card>

      <Card size="sm" className="v2-surface py-3">
        <CardHeader className="pb-2"><CardTitle className="text-base">Note</CardTitle></CardHeader>
        <CardContent>
          {note.trim() ? <pre className="whitespace-pre-wrap break-words rounded-2xl border border-[var(--border)] bg-white p-4 text-sm text-[var(--foreground)]">{note}</pre> : <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No note.</div>}
        </CardContent>
      </Card>

      <Card size="sm" className="v2-surface py-3">
        <CardHeader className="pb-2"><CardTitle className="text-base">Pointers</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pointers.map((pointer) => pointer.href ? (
            <Link key={`${pointer.type}:${pointer.id}`} href={pointer.href} className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)]"><span className="inline-flex items-center gap-2"><Link2 className="size-4 text-[var(--primary)]" /> {pointer.type}:{pointer.id}</span><span className="text-xs text-[var(--muted-foreground)]">open</span></Link>
          ) : (
            <div key={`${pointer.type}:${pointer.id}`} className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--muted-foreground)]">{pointer.type}:{pointer.id}</div>
          ))}
          {!loading && pointers.length === 0 && <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No linked pointers found.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
