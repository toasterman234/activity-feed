"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, FolderGit2, RefreshCcw } from "lucide-react";
import { useV2ProjectDetail } from "../_hooks/useV2ProjectDetail";
import { formatRelative, statusTone } from "./v2-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export default function ProjectDetailView({ repoId }: { repoId: string }) {
  const { data, loading, error, refresh } = useV2ProjectDetail(repoId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/mobile-v2/projects" className="inline-flex items-center gap-2 text-sm text-[var(--primary)]"><ArrowLeft className="size-4" /> Back to Projects</Link>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]">{data?.repo.name || "Project"}</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Dedicated mobile-v2 detail view for project state, threads, artifacts, and AIWG docs.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCcw className="size-4" /> Refresh
        </Button>
      </div>

      {error && <div className="v2-surface p-4 text-sm text-[var(--destructive)]">{error}</div>}

      <Card size="sm" className="v2-surface py-3">
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div><div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Phase</div><div className="mt-1 text-lg font-semibold">{data?.project_phase.label || "—"}</div></div>
          <div><div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Threads</div><div className="mt-1 text-lg font-semibold">{data?.threads.length || 0}</div></div>
          <div><div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Artifacts</div><div className="mt-1 text-lg font-semibold">{data?.artifacts.length || 0}</div></div>
          <div><div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Promotions</div><div className="mt-1 text-lg font-semibold">{data?.promotions.length || 0}</div></div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-3">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="threads">Threads</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
          <TabsTrigger value="aiwg">AIWG</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          <Card size="sm" className="v2-surface py-3">
            <CardHeader className="pb-2"><CardTitle className="text-base">Project state</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-xl border border-[var(--border)] bg-white p-3">
                <div className="flex items-center gap-2 text-[var(--foreground)]"><FolderGit2 className="size-4 text-[var(--primary)]" /> {data?.repo.path}</div>
                <p className="mt-2 text-[var(--muted-foreground)]">{data?.project_phase.reason}</p>
                <p className="mt-2 text-[var(--primary)]">Recommended: {data?.project_phase.recommended_action}</p>
              </div>
              {data?.active_thread && <Link href={`/channels/${data.active_thread.channel_id}/${data.active_thread.thread_id}`} className="block rounded-xl border border-[var(--border)] bg-white p-3"><p className="text-sm font-medium text-[var(--foreground)]">Active thread: {data.active_thread.title}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{data.active_thread.lifecycle} · {data.active_thread.state}</p></Link>}
              {data?.source_thread && <Link href={`/channels/${data.source_thread.channel_id}/${data.source_thread.thread_id}`} className="block rounded-xl border border-[var(--border)] bg-white p-3"><p className="text-sm font-medium text-[var(--foreground)]">Source thread: {data.source_thread.title}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{data.source_thread.lifecycle} · {data.source_thread.state}</p></Link>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="threads" className="space-y-3">
          <Card size="sm" className="v2-surface py-3">
            <CardHeader className="pb-2"><CardTitle className="text-base">Repo threads</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(data?.threads || []).map((thread) => (
                <Link key={thread.thread_id} href={`/channels/${thread.channel_id}/${thread.thread_id}`} className="block rounded-xl border border-[var(--border)] bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">{thread.title}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{thread.lifecycle} · updated {formatRelative(thread.updated_at)}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${statusTone(thread.state)}`}>{thread.state}</span>
                  </div>
                </Link>
              ))}
              {!loading && (data?.threads || []).length === 0 && <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No repo-bound threads found.</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="artifacts" className="space-y-3">
          <Card size="sm" className="v2-surface py-3">
            <CardHeader className="pb-2"><CardTitle className="text-base">Artifacts + promotions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(data?.artifacts || []).slice(0, 8).map((artifact) => (
                <div key={artifact.id} className="rounded-xl border border-[var(--border)] bg-white p-3">
                  <p className="text-sm font-medium text-[var(--foreground)]">{artifact.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{artifact.kind} · {artifact.thread_title}</p>
                </div>
              ))}
              {(data?.promotions || []).slice(0, 6).map((promo) => (
                <div key={promo.id} className="rounded-xl border border-[var(--border)] bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">Promotion · {promo.thread_title}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{promo.progress || promo.status}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${statusTone(promo.status)}`}>{promo.status}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aiwg" className="space-y-3">
          <Card size="sm" className="v2-surface py-3">
            <CardHeader className="pb-2"><CardTitle className="text-base">AIWG docs</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(data?.aiwg.docs || []).map((doc) => (
                <div key={doc.path} className="rounded-xl border border-[var(--border)] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[var(--foreground)]">{doc.name}</p>
                    <span className="text-[11px] text-[var(--muted-foreground)]">{formatRelative(doc.updated_at)}</span>
                  </div>
                  <pre className="mt-2 line-clamp-6 whitespace-pre-wrap text-xs text-[var(--muted-foreground)]">{doc.content}</pre>
                </div>
              ))}
              {(data?.aiwg.intake_docs || []).map((doc) => (
                <div key={doc.path} className="rounded-xl border border-[var(--border)] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[var(--foreground)]">{doc.name}</p>
                    <span className="text-[11px] text-[var(--muted-foreground)]">{formatRelative(doc.updated_at)}</span>
                  </div>
                  <pre className="mt-2 line-clamp-6 whitespace-pre-wrap text-xs text-[var(--muted-foreground)]">{doc.content}</pre>
                </div>
              ))}
              {(!data?.aiwg.docs?.length && !data?.aiwg.intake_docs?.length) && <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">No AIWG docs found for this repo.</div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card size="sm" className="v2-surface py-3">
        <CardHeader className="pb-2"><CardTitle className="text-base">Open full routes</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Link href={`/projects/${repoId}`} className="rounded-xl border border-[var(--border)] bg-white px-3 py-3 text-sm font-medium text-[var(--foreground)]"><div className="flex items-center justify-between gap-2"><span>Desktop project page</span><ExternalLink className="size-4 text-[var(--primary)]" /></div></Link>
          {data?.active_thread && <Link href={`/channels/${data.active_thread.channel_id}/${data.active_thread.thread_id}`} className="rounded-xl border border-[var(--border)] bg-white px-3 py-3 text-sm font-medium text-[var(--foreground)]"><div className="flex items-center justify-between gap-2"><span>Active thread</span><ExternalLink className="size-4 text-[var(--primary)]" /></div></Link>}
        </CardContent>
      </Card>
    </div>
  );
}
