"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FolderKanban, RefreshCcw, Search, Sparkles } from "lucide-react";
import { useV2Projects } from "../_hooks/useV2Projects";
import { useV2TududiOverview } from "../_hooks/useV2TududiOverview";
import V2TududiProjectCard from "./V2TududiProjectCard";
import V2TududiTaskCard from "./V2TududiTaskCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { startMeasure } from "@/lib/perf";

export default function ProjectsView() {
  const { repos, loading: reposLoading, error: reposError, refresh: refreshRepos } = useV2Projects();
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("all");
  const [selectedProjectUid, setSelectedProjectUid] = useState<string | undefined>(undefined);
  const [isMdUp, setIsMdUp] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const { projectsData, selectedData, linkedRepos, loading: tududiLoading, selectedLoading, error: tududiError, debug, refresh: refreshTududi } = useV2TududiOverview(selectedProjectUid);
  const selectionStopRef = useRef<null | ((extraDetail?: Record<string, unknown>) => void)>(null);

  const projects = useMemo(() => projectsData?.projects || [], [projectsData?.projects]);

  useEffect(() => {
    if (!selectedProjectUid && projects[0]?.uid) setSelectedProjectUid(projects[0].uid);
  }, [selectedProjectUid, projects]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsMdUp(media.matches);
    sync();
    media.addEventListener("change", sync);
    setDebugEnabled(new URLSearchParams(window.location.search).get("debugProjects") === "1");
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (selectedProjectUid && selectedData?.selected_project?.uid === selectedProjectUid && selectionStopRef.current) {
      selectionStopRef.current({
        targetUid: selectedProjectUid,
        tasksReturned: selectedData.tasks?.length || 0,
        openCount: selectedData.open_count ?? 0,
      });
      selectionStopRef.current = null;
    }
  }, [selectedProjectUid, selectedData]);

  const filteredProjects = useMemo(() => {
    let items = [...projects];
    const q = query.trim().toLowerCase();
    if (q) items = items.filter((project) => project.name.toLowerCase().includes(q) || (project.description || "").toLowerCase().includes(q) || project.uid.toLowerCase().includes(q));
    return items;
  }, [projects, query]);

  const effectiveProjectUid = selectedProjectUid || filteredProjects[0]?.uid || projects[0]?.uid;
  const previewTasks = selectedData && effectiveProjectUid && selectedData.selected_project?.uid === effectiveProjectUid ? selectedData.tasks || [] : [];
  const previewOpen = previewTasks.filter((task) => task.status_label !== "done");

  const filteredRepos = useMemo(() => {
    let items = [...repos];
    const q = query.trim().toLowerCase();
    if (q) items = items.filter((repo) => repo.name.toLowerCase().includes(q) || repo.path.toLowerCase().includes(q));
    if (segment === "active") items = items.filter((repo) => repo.active_thread_count > 0);
    if (segment === "scaffolded") items = items.filter((repo) => repo.scaffold_detected);
    if (segment === "attention") items = items.filter((repo) => !repo.exists_on_disk || repo.active_thread_count > 0);
    items.sort((a, b) => b.active_thread_count - a.active_thread_count || a.name.localeCompare(b.name));
    return items;
  }, [repos, query, segment]);

  const refreshAll = async () => {
    await Promise.all([refreshRepos(), refreshTududi()]);
  };

  return (
    <div className="space-y-2 overflow-x-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--muted-foreground)]">Projects</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">Tududi planning + repos</h2>
          <p className="mt-0.5 text-xs text-[var(--foreground)]/70 sm:text-sm">Planning is phone-first now. Repo pages stay underneath.</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => void refreshAll()}>
          <RefreshCcw className="size-4" />
        </Button>
      </div>

      {(reposError || tududiError) && <div className="v2-surface p-3 text-sm text-[var(--destructive)]">{reposError || tududiError}</div>}

      {debugEnabled && (
        <div className="v2-surface rounded-2xl p-3 text-[11px] text-[var(--foreground)]/75">
          <div className="font-semibold text-[var(--foreground)]">Projects debug</div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
            <span>projects: {debug?.projectsFetchMs ?? "—"}ms</span>
            <span>repos: {debug?.reposFetchMs ?? "—"}ms</span>
            <span>detail: {debug?.detailFetchMs ?? "—"}ms</span>
            <span>cache: {debug?.usedCache ? "hit" : "miss"}</span>
            <span>tasks: {debug?.tasksReturned ?? "—"}</span>
            <span>selected: {debug?.selectedResolvedUid || "—"}</span>
          </div>
        </div>
      )}

      {!isMdUp ? <div className="space-y-2">
        <div className="v2-surface rounded-2xl p-2">
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--foreground)]/65" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Tududi projects or repos"
                className="h-9 rounded-xl border-[var(--border)] pl-9 text-[var(--foreground)] placeholder:text-[color-mix(in_srgb,var(--foreground)_58%,white)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setSegment("all")}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${segment === "all" ? "border-[#111318] bg-white text-[#111318]" : "border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]/70"}`}
              >
                All repos
              </button>
              <button
                type="button"
                onClick={() => setSegment("active")}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${segment === "active" ? "border-[#111318] bg-white text-[#111318]" : "border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]/70"}`}
              >
                Active repos
              </button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="planning" className="space-y-2">
          <TabsList className="grid w-full grid-cols-2 overflow-hidden rounded-xl p-1">
            <TabsTrigger value="planning">Planning</TabsTrigger>
            <TabsTrigger value="repos">Repos</TabsTrigger>
          </TabsList>

          <TabsContent value="planning" className="space-y-1">
            <div className="rounded-xl border border-[var(--border)] bg-white px-2.5 py-1.5 text-[10px] text-[var(--foreground)]/72">
              <span className="font-medium text-[var(--foreground)]">{filteredProjects.length}</span> projects
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
              {filteredProjects.map((project, index) => {
                const active = effectiveProjectUid === project.uid;
                const hasActiveDetail = active && selectedData?.selected_project?.uid === project.uid;
                const isActiveLoading = active && selectedLoading && !hasActiveDetail;
                const openCount = hasActiveDetail ? (selectedData?.open_count ?? previewOpen.length) : undefined;
                const doneCount = hasActiveDetail ? (selectedData?.done_count ?? 0) : undefined;
                const totalCount = typeof openCount === "number" && typeof doneCount === "number" ? openCount + doneCount : undefined;
                return (
                  <div key={project.uid} className={index !== 0 ? "border-t border-[var(--border)]" : ""}>
                    <button
                      type="button"
                      onClick={() => {
                        selectionStopRef.current?.({ interrupted: true });
                        selectionStopRef.current = startMeasure("mobile-v2.projects.tap-to-detail", { targetUid: project.uid });
                        setSelectedProjectUid(project.uid);
                      }}
                      className={`block w-full px-2.5 py-1.5 text-left ${active ? "bg-[#f6f6f7]" : "bg-white"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--foreground)]">{project.name}</div>
                        {isActiveLoading ? <div className="shrink-0 text-[10px] font-medium text-[var(--foreground)]/55">Loading…</div> : null}
                        {!isActiveLoading && typeof openCount === "number" && <div className="shrink-0 text-[10px] font-medium text-[var(--foreground)]/72">{openCount} open</div>}
                      </div>
                    </button>
                    {active && (
                      <div className="border-t border-[var(--border)] bg-[#fcfcfc] px-2.5 py-1.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-[var(--foreground)]/68">
                          <div className="flex flex-wrap gap-2">
                            {isActiveLoading ? <span>Loading tasks…</span> : <>
                              <span>{openCount ?? 0} open</span>
                              <span>{doneCount ?? 0} done</span>
                              {typeof totalCount === "number" ? <span>{totalCount} total</span> : null}
                            </>}
                          </div>
                          <Link href={`/mobile-v2/projects/tududi/${project.uid}`} className="font-medium text-[var(--primary)]">
                            View all tasks
                          </Link>
                        </div>
                        <div className="space-y-1">
                          {previewOpen.slice(0, 2).map((task) => (
                            <Link
                              key={task.uid}
                              href={`/mobile-v2/projects/tududi/${effectiveProjectUid}/${task.uid}`}
                              className="block truncate rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[11px] text-[var(--foreground)]/80"
                            >
                              {task.name}
                            </Link>
                          ))}
                          {isActiveLoading ? (
                            <div className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[10px] text-[var(--foreground)]/60">
                              Loading tasks…
                            </div>
                          ) : null}
                          {!!selectedData && hasActiveDetail && previewOpen.length === 0 && !isActiveLoading && (
                            <div className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[10px] text-[var(--foreground)]/60">
                              {doneCount ? "No open tasks — view project for completed tasks." : "No tasks in this project yet."}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!tududiLoading && filteredProjects.length === 0 && <div className="px-2.5 py-2 text-xs text-[var(--muted-foreground)]">No Tududi projects match this search.</div>}
            </div>
          </TabsContent>

          <TabsContent value="repos" className="space-y-1">
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
              {filteredRepos.map((repo, index) => (
                <Link
                  key={repo.id}
                  href={`/mobile-v2/projects/${repo.id}`}
                  className={`block px-2.5 py-1.5 ${index !== 0 ? "border-t border-[var(--border)]" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--foreground)]">{repo.name}</div>
                    <div className="shrink-0 text-[10px] text-[var(--foreground)]/72">{repo.active_thread_count}</div>
                  </div>
                </Link>
              ))}
              {!reposLoading && filteredRepos.length === 0 && <div className="px-2.5 py-2 text-xs text-[var(--muted-foreground)]">No repos match the current filter.</div>}
            </div>
          </TabsContent>
        </Tabs>
      </div> : null}

      {isMdUp ? <div>
        <Tabs defaultValue="planning" className="space-y-2">
          <TabsList className="grid w-full grid-cols-2 overflow-hidden">
            <TabsTrigger value="planning">Planning</TabsTrigger>
            <TabsTrigger value="repos">Repos</TabsTrigger>
          </TabsList>

          <TabsContent value="planning" className="space-y-2">
            <Card size="sm" className="v2-surface py-2">
              <CardContent className="space-y-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--foreground)]/65" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Tududi projects or repos"
                    className="pl-9 text-[var(--foreground)] placeholder:text-[color-mix(in_srgb,var(--foreground)_58%,white)]"
                  />
                </div>
                <Select value={segment} onValueChange={setSegment}>
                  <SelectTrigger className="w-full text-[var(--foreground)] data-placeholder:text-[color-mix(in_srgb,var(--foreground)_58%,white)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All repos</SelectItem>
                    <SelectItem value="active">Active repos</SelectItem>
                    <SelectItem value="scaffolded">Scaffolded repos</SelectItem>
                    <SelectItem value="attention">Needs attention</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <div className="hidden gap-3 xl:grid xl:grid-cols-[0.95fr,1.05fr]">
              <Card size="sm" className="v2-surface py-3">
                <CardHeader className="pb-2"><CardTitle className="text-base">Tududi projects</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {filteredProjects.map((project) => (
                    <div key={project.uid} onMouseEnter={() => setSelectedProjectUid(project.uid)} onFocus={() => setSelectedProjectUid(project.uid)}>
                      <V2TududiProjectCard
                        project={project}
                        active={effectiveProjectUid === project.uid}
                        counts={effectiveProjectUid === project.uid ? {
                          open: selectedData?.open_count ?? previewOpen.length,
                          done: selectedData?.done_count ?? 0,
                          decisions: selectedData?.convention_counts?.decisions ?? 0,
                          forks: selectedData?.convention_counts?.forks ?? 0,
                          stages: selectedData?.convention_counts?.stages ?? 0,
                        } : undefined}
                        linkedRepos={effectiveProjectUid === project.uid ? linkedRepos : undefined}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card size="sm" className="v2-surface py-3">
                <CardHeader className="pb-2"><CardTitle className="text-base">Project preview</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {effectiveProjectUid ? (
                    <>
                      <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
                        <p className="text-sm font-medium text-[var(--foreground)]">{selectedData?.selected_project?.name || effectiveProjectUid}</p>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{selectedData?.selected_project?.description || "Hover a project card to load its task preview."}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--muted-foreground)]">
                          <span>{selectedData?.open_count ?? previewOpen.length} open</span>
                          <span>{selectedData?.done_count ?? 0} done</span>
                          <span>{selectedData?.convention_counts?.decisions ?? 0} decisions</span>
                          <span>{selectedData?.convention_counts?.stages ?? 0} stages</span>
                        </div>
                      </div>

                      {!!linkedRepos.length && (
                        <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Linked repos</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {linkedRepos.map((repo) => (
                              <Link key={repo.id} href={`/mobile-v2/projects/${repo.id}`} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)]">{repo.name}</Link>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {previewOpen.slice(0, 6).map((task) => <V2TududiTaskCard key={task.uid} projectUid={effectiveProjectUid} task={task} />)}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No Tududi project available.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="repos" className="space-y-2">
            <div className="space-y-1.5 overflow-x-hidden xl:grid xl:grid-cols-2 xl:gap-3 xl:space-y-0">
              {filteredRepos.map((repo) => (
                <Link key={repo.id} href={`/mobile-v2/projects/${repo.id}`} className="mx-0.5 block overflow-hidden rounded-xl border border-[var(--border)] bg-white px-2.5 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[var(--foreground)]">
                        <FolderKanban className="size-4 text-[var(--primary)]" />
                        <p className="truncate text-sm font-semibold">{repo.name}</p>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-[var(--foreground)]/72">{repo.path}</p>
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-[var(--foreground)]/72">
                        <span>{repo.active_thread_count} active</span>
                        <span>{repo.archived_thread_count} archived</span>
                        <span>{repo.scaffold_detected ? "AIWG" : "Raw"}</span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-[10px] text-[var(--foreground)]/72">{repo.active_thread_count > 0 ? "active" : "idle"}</span>
                  </div>
                </Link>
              ))}
              {!reposLoading && filteredRepos.length === 0 && <div className="v2-surface p-4 text-sm text-[var(--muted-foreground)]">No repos match the current filter.</div>}
            </div>
          </TabsContent>
        </Tabs>
      </div> : null}

      {isMdUp ? <Card size="sm" className="v2-surface py-2">
        <CardContent>
          <div className="rounded-xl border border-[var(--border)] bg-white p-2.5 text-sm text-[var(--foreground)]/72">
            <div className="flex items-center gap-2 text-[var(--foreground)]"><Sparkles className="size-4 text-[var(--primary)]" /> Tududi is the planning spine inside mobile-v2</div>
            <p className="mt-1 text-xs sm:text-sm">Use Planning for Tududi projects/tasks. Use Repos for repo-bound AIWG detail pages.</p>
          </div>
        </CardContent>
      </Card> : null}
    </div>
  );
}
