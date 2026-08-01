"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Link2, RefreshCcw } from "lucide-react";
import { useMemo } from "react";
import { useV2TududiOverview } from "../_hooks/useV2TududiOverview";
import { formatRelative } from "./v2-utils";
import V2TududiTaskCard from "./V2TududiTaskCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export default function TududiProjectDetailView({ projectUid }: { projectUid: string }) {
  const { selectedData, linkedRepos, loading, error, refresh } = useV2TududiOverview(projectUid);
  const tasks = selectedData?.tasks || [];
  const open = useMemo(() => tasks.filter((task) => task.status_label !== "done"), [tasks]);
  const done = useMemo(() => tasks.filter((task) => task.status_label === "done"), [tasks]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/mobile-v2/projects" className="inline-flex items-center gap-2 text-sm text-[var(--primary)]"><ArrowLeft className="size-4" /> Back to Projects</Link>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]">{selectedData?.selected_project?.name || projectUid}</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Tududi project detail inside mobile-v2.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCcw className="size-4" /> Refresh
          </Button>
          {selectedData?.public_base && <a href={selectedData.public_base} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--foreground)]">Open Tududi <ExternalLink className="ml-2 size-4 text-[var(--primary)]" /></a>}
        </div>
      </div>

      {error && <div className="v2-surface p-4 text-sm text-[var(--destructive)]">{error}</div>}

      <Card size="sm" className="v2-surface py-3">
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div><div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Open</div><div className="mt-1 text-lg font-semibold">{selectedData?.open_count ?? open.length}</div></div>
          <div><div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Done</div><div className="mt-1 text-lg font-semibold">{selectedData?.done_count ?? done.length}</div></div>
          <div><div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Decisions</div><div className="mt-1 text-lg font-semibold">{selectedData?.convention_counts?.decisions ?? 0}</div></div>
          <div><div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Stages</div><div className="mt-1 text-lg font-semibold">{selectedData?.convention_counts?.stages ?? 0}</div></div>
        </CardContent>
      </Card>

      <Card size="sm" className="v2-surface py-3">
        <CardHeader className="pb-2"><CardTitle className="text-base">Project summary</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <p className="text-[var(--foreground)]">{selectedData?.selected_project?.description || "No description."}</p>
            <p className="mt-2 font-mono text-[11px] text-[var(--muted-foreground)]">{selectedData?.selected_project?.uid}</p>
          </div>
          {!!linkedRepos.length && (
            <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Linked repos</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {linkedRepos.map((repo) => (
                  <Link key={repo.id} href={`/mobile-v2/projects/${repo.id}`} className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)]"><Link2 className="size-3.5 text-[var(--primary)]" /> {repo.name}</Link>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="open" className="space-y-3">
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="space-y-2">
          {open.map((task) => <V2TududiTaskCard key={task.uid} projectUid={projectUid} task={task} />)}
          {!loading && open.length === 0 && <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No open tasks.</div>}
        </TabsContent>

        <TabsContent value="done" className="space-y-2">
          {done.map((task) => <V2TududiTaskCard key={task.uid} projectUid={projectUid} task={task} />)}
          {!loading && done.length === 0 && <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No completed tasks.</div>}
        </TabsContent>

        <TabsContent value="templates" className="space-y-2">
          {(selectedData?.templates || []).filter((t) => String(t.template_category || "") === "lifecycle" || /workflow|lead|onboard/i.test(t.name)).map((template) => (
            <div key={template.uid} className="rounded-2xl border border-[var(--border)] bg-white p-3 text-sm">
              <p className="font-medium text-[var(--foreground)]">{template.name}</p>
              <p className="mt-1 text-[var(--muted-foreground)]">{template.description || "No description"}</p>
              {template.task_count != null && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{template.task_count} tasks</p>}
            </div>
          ))}
          {!loading && !(selectedData?.templates || []).length && <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No templates returned.</div>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
