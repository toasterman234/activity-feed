import { NextRequest, NextResponse } from "next/server";
import {
  listProjects,
  listTasks,
  listAreas,
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

  const areasRes = await listAreas();
  const areas = areasRes.ok ? areasRes.areas : [];

  return NextResponse.json({
    ok: true,
    configured: true,
    public_base: tududiPublicBase(),
    projects: projectsRes.projects,
    selected_project: selected,
    tasks,
    templates,
    areas,
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

  if (action === "create_task" || action === "upsert_task") {
    const externalId = body.external_id ? String(body.external_id).trim() : "";
    const name = String(body.name || body.title || "").trim();
    const projectId = body.project_id;
    const projectUid = body.project_uid ? String(body.project_uid) : undefined;

    if (!projectId && !projectUid) {
      return NextResponse.json(
        { ok: false, error: "project_id or project_uid required" },
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
        external_id: externalId || undefined,
      },
      noteBody,
    );
    const tags = Array.isArray(body.tags)
      ? body.tags.map(String)
      : kind !== "task"
        ? [kind]
        : undefined;

    // Upsert: search existing tasks for matching external_id
    if (action === "upsert_task" && externalId) {
      const tasksRes = await listTasks({ project_id: projectId as number | undefined, project_uid: projectUid });
      if (tasksRes.ok) {
        const existing = tasksRes.tasks.find((t) => {
          const note = t.note || "";
          return note.includes(`[external_id:${externalId}]`);
        });
        if (existing) {
          const patchBody: Record<string, unknown> = {};
          if (name) patchBody.name = name;
          if (note) patchBody.note = note;
          if (body.status != null) patchBody.status = body.status;
          if (body.priority != null) patchBody.priority = body.priority;
          const res = await tududiFetch(`/api/v1/task/${encodeURIComponent(existing.uid)}`, {
            method: "PATCH",
            body: patchBody,
          });
          if (!res.ok) {
            return NextResponse.json(
              { ok: false, error: res.error || `PATCH ${res.status}`, detail: res.json },
              { status: res.status || 502 },
            );
          }
          return NextResponse.json({ ok: true, task: res.json, created: false, upserted: true });
        }
      }
    }

    if (!name) {
      return NextResponse.json(
        { ok: false, error: "name required for new task" },
        { status: 400 },
      );
    }

    const res = await tududiFetch("/api/v1/task", {
      method: "POST",
      body: {
        name,
        project_id: projectId,
        project_uid: projectUid,
        note,
        priority: body.priority,
        ...(body.status != null ? { status: body.status } : {}),
        ...(tags?.length ? { tags } : {}),
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error || `HTTP ${res.status}`, detail: res.json },
        { status: res.status || 502 },
      );
    }
    return NextResponse.json({ ok: true, task: res.json, created: true });
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
    const projectBody: Record<string, unknown> = {
      name,
      description: body.description ? String(body.description) : "",
    };
    if (body.area_id != null) projectBody.area_id = body.area_id;
    const res = await tududiFetch("/api/v1/project", {
      method: "POST",
      body: projectBody,
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error || `HTTP ${res.status}`, detail: res.json },
        { status: res.status || 502 },
      );
    }
    return NextResponse.json({ ok: true, project: res.json });
  }

  if (action === "create_area") {
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
    }
    const areaBody: Record<string, unknown> = { name };
    if (body.description) areaBody.description = String(body.description);
    const res = await tududiFetch("/api/v1/areas", {
      method: "POST",
      body: areaBody,
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error || `HTTP ${res.status}`, detail: res.json },
        { status: res.status || 502 },
      );
    }
    return NextResponse.json({ ok: true, area: res.json });
  }

  return NextResponse.json({ ok: false, error: `unknown action: ${action}` }, { status: 400 });
}
