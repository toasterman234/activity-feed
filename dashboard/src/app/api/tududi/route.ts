import { NextRequest, NextResponse } from "next/server";
import {
  listProjects,
  listTasks,
  statusLabel,
  tududiConfigured,
  tududiFetch,
  tududiPublicBase,
} from "@/lib/tududi";
import { buildConventionNote, parseConventions } from "@/lib/tududiConventions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") || "overview";

  if (!tududiConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "Tududi API key not configured on this host",
        public_base: tududiPublicBase(),
      },
      { status: 503 },
    );
  }

  if (view === "health") {
    const probe = await tududiFetch("/api/v1/projects");
    return NextResponse.json({
      ok: probe.ok,
      configured: true,
      status: probe.status,
      public_base: tududiPublicBase(),
      error: probe.error,
    });
  }

  const projectsRes = await listProjects();
  if (!projectsRes.ok) {
    return NextResponse.json(
      { ok: false, configured: true, error: projectsRes.error, projects: [] },
      { status: 502 },
    );
  }

  const projectUid = searchParams.get("project_uid") || "";
  const projectId = searchParams.get("project_id");
  let tasks: Array<Record<string, unknown>> = [];
  let selected = projectsRes.projects[0] || null;

  if (projectUid) {
    selected =
      projectsRes.projects.find((p) => p.uid === projectUid) || selected;
  } else if (projectId) {
    selected =
      projectsRes.projects.find((p) => String(p.id) === String(projectId)) ||
      selected;
  }

  if (selected) {
    const tasksRes = await listTasks({
      project_id: selected.id,
      project_uid: selected.uid,
    });
    if (tasksRes.ok) {
      tasks = tasksRes.tasks.map((t) => {
        const tags = (t as { tags?: unknown; Tags?: unknown }).tags
          || (t as { Tags?: unknown }).Tags
          || [];
        const c = parseConventions(t.note, tags as Array<{ name?: string } | string>);
        return {
          ...t,
          status_label: statusLabel(t.status),
          kind: c.kind,
          stage: c.stage,
          decision: c.decision,
          fork_of: c.fork_of,
          path: c.path,
          outcome: c.outcome,
          repo: c.repo,
          blocked: c.blocked,
        };
      });
    }
  }

  const templatesRes = await tududiFetch<{ templates?: Array<Record<string, unknown>> }>(
    "/api/v1/templates",
  );
  const templates = templatesRes.ok ? templatesRes.json.templates || [] : [];

  return NextResponse.json({
    ok: true,
    configured: true,
    public_base: tududiPublicBase(),
    projects: projectsRes.projects,
    selected_project: selected,
    tasks,
    templates,
    open_count: tasks.filter((t) => t.status_label !== "done").length,
    done_count: tasks.filter((t) => t.status_label === "done").length,
    convention_counts: {
      stages: tasks.filter((t) => t.kind === "stage" && t.status_label !== "done").length,
      decisions: tasks.filter((t) => t.kind === "decision" && t.status_label !== "done").length,
      forks: tasks.filter((t) => t.kind === "fork" && t.status_label !== "done").length,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!tududiConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Tududi API key not configured" },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");

  if (action === "create_task") {
    const name = String(body.name || "").trim();
    const projectId = body.project_id;
    if (!name || projectId == null) {
      return NextResponse.json(
        { ok: false, error: "name and project_id required" },
        { status: 400 },
      );
    }
    const kind = String(body.kind || "task").trim().toLowerCase() || "task";
    const noteBody = body.note ? String(body.note) : "from activity-dashboard";
    const note = buildConventionNote(
      {
        kind: kind === "task" ? undefined : kind,
        stage: body.stage ? String(body.stage) : undefined,
        decision: body.decision ? String(body.decision) : undefined,
        fork_of: body.fork_of ? String(body.fork_of) : undefined,
        path: body.path ? String(body.path) : undefined,
        outcome: body.outcome ? String(body.outcome) : undefined,
      },
      noteBody,
    );
    const tags = Array.isArray(body.tags)
      ? body.tags.map(String)
      : kind !== "task"
        ? [kind]
        : undefined;
    const res = await tududiFetch("/api/v1/task", {
      method: "POST",
      body: {
        name,
        project_id: projectId,
        note,
        priority: body.priority,
        ...(tags?.length ? { tags } : {}),
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error || `HTTP ${res.status}`, detail: res.json },
        { status: res.status || 502 },
      );
    }
    return NextResponse.json({ ok: true, task: res.json });
  }

  if (action === "set_status") {
    const uid = String(body.uid || "").trim();
    const status = body.status;
    if (!uid || status == null) {
      return NextResponse.json(
        { ok: false, error: "uid and status required" },
        { status: 400 },
      );
    }
    const res = await tududiFetch(`/api/v1/task/${encodeURIComponent(uid)}`, {
      method: "PATCH",
      body: { status },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error || `HTTP ${res.status}`, detail: res.json },
        { status: res.status || 502 },
      );
    }
    return NextResponse.json({ ok: true, task: res.json });
  }

  if (action === "set_order") {
    const uid = String(body.uid || "").trim();
    const order = Number(body.order);
    if (!uid || isNaN(order)) {
      return NextResponse.json(
        { ok: false, error: "uid and order (number) required" },
        { status: 400 },
      );
    }
    const res = await tududiFetch(`/api/v1/task/${encodeURIComponent(uid)}`, {
      method: "PATCH",
      body: { order },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error || `HTTP ${res.status}`, detail: res.json },
        { status: res.status || 502 },
      );
    }
    return NextResponse.json({ ok: true, task: res.json });
  }

  if (action === "create_project") {
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
    }
    const res = await tududiFetch("/api/v1/project", {
      method: "POST",
      body: {
        name,
        description: body.description ? String(body.description) : "",
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error || `HTTP ${res.status}`, detail: res.json },
        { status: res.status || 502 },
      );
    }
    return NextResponse.json({ ok: true, project: res.json });
  }

  return NextResponse.json({ ok: false, error: `unknown action: ${action}` }, { status: 400 });
}
