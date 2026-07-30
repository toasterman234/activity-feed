"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui";
import { TududiPlanningTree } from "./TududiPlanningTree";
import { buildConventionNote } from "@/lib/tududiConventions";

type TududiProject = {
  id: number;
  uid: string;
  name: string;
  description?: string | null;
  status?: string | null;
};

type TududiTask = {
  id: number;
  uid: string;
  name: string;
  status_label?: string;
  status?: number | string;
  note?: string | null;
  kind?: string;
  stage?: string | null;
  path?: string | null;
  outcome?: string | null;
  blocked?: boolean;
};

type TududiTemplate = {
  uid: string;
  name: string;
  description?: string | null;
  template_category?: string | null;
  task_count?: number;
};

type Overview = {
  ok: boolean;
  configured?: boolean;
  error?: string;
  public_base?: string;
  projects?: TududiProject[];
  selected_project?: TududiProject | null;
  tasks?: TududiTask[];
  templates?: TududiTemplate[];
  open_count?: number;
  done_count?: number;
  convention_counts?: {
    stages?: number;
    decisions?: number;
    forks?: number;
  };
};

const KIND_OPTIONS = [
  { value: "task", label: "Task" },
  { value: "stage", label: "Stage" },
  { value: "decision", label: "Decision" },
  { value: "fork", label: "Fork" },
  { value: "doc", label: "Doc" },
] as const;

export function TududiPlanningPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [projectUid, setProjectUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<(typeof KIND_OPTIONS)[number]["value"]>("task");

  const load = useCallback(async (uid?: string) => {
    setBusy(true);
    setErr(null);
    try {
      const qs = uid ? `?project_uid=${encodeURIComponent(uid)}` : "";
      const res = await fetch(`/api/tududi${qs}`, { cache: "no-store" });
      const json = (await res.json()) as Overview;
      if (!res.ok && res.status !== 503) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setData(json);
      if (json.selected_project?.uid) {
        setProjectUid(json.selected_project.uid);
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSelect = async (uid: string) => {
    setProjectUid(uid);
    await load(uid);
  };

  const setStatus = async (uid: string, status: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/tududi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_status", uid, status }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await load(projectUid);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

  const addTask = async () => {
    const name = newTitle.trim();
    const project = data?.selected_project;
    if (!name || !project || busy) return;
    setBusy(true);
    setErr(null);
    try {
      // Use external_id marker for idempotent upserts.
      const externalId = `ad:pwa:ui-kit:task:${Date.now()}`;
      const note = buildConventionNote(
        {
          kind: newKind !== "task" ? newKind : undefined,
          external_id: externalId,
        },
        `from activity-dashboard · ${new Date().toISOString()}`,
      );
      const res = await fetch("/api/tududi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_task",
          name,
          project_id: project.id,
          kind: newKind,
          note,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setNewTitle("");
      setNewKind("task");
      await load(projectUid);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

  if (data && data.configured === false) {
    return (
      <Card size="sm" className="border-amber-300/50 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/40">
        <CardContent>
          <h2 className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Planning (Tududi)
          </h2>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            Not configured on this host. Set TUDUDI_API_KEY / TUDUDI_API_KEY_FILE.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tasks = data?.tasks || [];
  const open = tasks.filter((t) => (t.status_label || "") !== "done");
  const done = tasks.filter((t) => t.status_label === "done");
  const counts = data?.convention_counts;
  const lifecycleTemplates = (data?.templates || []).filter(
    (t) =>
      String(t.template_category || "") === "lifecycle" ||
      /workflow|lead|onboard/i.test(t.name),
  );

  return (
    <Card size="sm">
      <CardContent>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Planning (Tududi)
          </h2>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Shared backlog for AD + iii. Stages / decisions / forks use convention tags.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.public_base && (
            <a
              href={data.public_base}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-primary hover:underline"
            >
              Open Tududi ↗
            </a>
          )}
          <button
            type="button"
            onClick={() => void load(projectUid)}
            disabled={busy}
            className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Refresh
          </button>
        </div>
      </div>

      {err && <p className="mb-2 text-xs text-red-500">{err}</p>}
      {!data && busy && <p className="text-xs text-muted-foreground">Loading Tududi…</p>}
      {data?.error && !data.ok && (
        <p className="mb-2 text-xs text-red-500">{data.error}</p>
      )}

      {(data?.projects?.length || 0) > 0 && (
        <div className="mb-2">
          <TududiPlanningTree
            projects={data?.projects || []}
            selectedProjectUid={projectUid || data?.selected_project?.uid || ""}
            tasks={tasks}
            busy={busy}
            onSelectProject={(uid) => { void onSelect(uid); }}
            onSetStatus={(uid, status) => { void setStatus(uid, status); }}
            onReorderTask={(uid, order) => {
              void (async () => {
                try {
                  await fetch("/api/tududi", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "set_order", uid, order }),
                  });
                } catch { /* best-effort */ }
              })();
            }}
          />
        </div>
      )}

      {data?.selected_project && (
        <>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {data.selected_project.description || "No description"} ·{" "}
            <span className="font-mono text-[10px]">{data.selected_project.uid}</span>
            {" · "}
            {data.open_count ?? open.length} open / {data.done_count ?? done.length} done
            {counts ? (
              <>
                {" · "}
                {counts.decisions || 0} decisions / {counts.forks || 0} forks /{" "}
                {counts.stages || 0} stages
              </>
            ) : null}
          </p>

          {lifecycleTemplates.length > 0 && (
            <div className="mb-2 rounded border border-border bg-muted/50 px-2 py-1.5">
              <p className="text-[10px] font-medium text-muted-foreground">
                Lifecycle templates (clone in Tududi)
              </p>
              <ul className="mt-1 space-y-0.5">
                {lifecycleTemplates.map((t) => (
                  <li key={t.uid} className="text-[11px]">
                    {t.name}
                    {t.task_count != null ? (
                      <span className="text-muted-foreground"> · {t.task_count} stages</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-2 flex flex-wrap gap-1">
            <select
              value={newKind}
              onChange={(e) =>
                setNewKind(e.target.value as (typeof KIND_OPTIONS)[number]["value"])
              }
              className="rounded border border-border bg-background px-1.5 py-1 text-[10px]"
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addTask();
              }}
              placeholder="Add planning item…"
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => void addTask()}
              disabled={busy || !newTitle.trim()}
              className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-40"
            >
              Add
            </button>
          </div>

          <details className="mt-2">
            <summary className="cursor-pointer text-[10px] text-muted-foreground">
              Convention legend
            </summary>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Tags: stage, decision, fork, doc, chosen, rejected, blocked. Note markers:{" "}
              <span className="font-mono">[kind:…]</span>{" "}
              <span className="font-mono">[stage:…]</span>{" "}
              <span className="font-mono">[decision:…]</span>{" "}
              <span className="font-mono">[fork_of:uid]</span>{" "}
              <span className="font-mono">[path:…]</span>{" "}
              <span className="font-mono">[outcome:open|chosen|rejected]</span>. Clone lifecycle
              templates in Tududi for workflow kits. AD keeps execution lifecycles.
            </p>
          </details>
        </>
      )}
      </CardContent>
    </Card>
  );
}
