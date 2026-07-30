import { readFileSync, existsSync } from "node:fs";

const BASE_URL = (process.env.TUDUDI_BASE_URL || "http://127.0.0.1:3002").replace(
  /\/$/,
  "",
);
const API_KEY_FILE =
  process.env.TUDUDI_API_KEY_FILE || "/opt/tududi/ops/api-key.txt";

function loadApiKey(): string {
  const fromEnv = (process.env.TUDUDI_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  try {
    if (existsSync(API_KEY_FILE)) {
      return readFileSync(API_KEY_FILE, "utf8").trim();
    }
  } catch {
    /* ignore */
  }
  return "";
}

export type TududiArea = {
  id: number;
  uid: string;
  name: string;
  description?: string | null;
  color?: string | null;
};

export type TududiProject = {
  id: number;
  uid: string;
  name: string;
  description?: string | null;
  status?: string | null;
  area_id?: number | null;
};

export type TududiTask = {
  id: number;
  uid: string;
  name: string;
  status: number | string;
  note?: string | null;
  project_id?: number | null;
  priority?: number | null;
  completed_at?: string | null;
};

export function tududiConfigured(): boolean {
  return Boolean(loadApiKey());
}

export function tududiPublicBase(): string {
  return (
    process.env.TUDUDI_PUBLIC_BASE_URL ||
    process.env.TUDUDI_BASE_URL ||
    "http://100.101.106.60:3002"
  ).replace(/\/$/, "");
}

export async function tududiFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; json: T; error?: string }> {
  const key = loadApiKey();
  if (!key) {
    return {
      ok: false,
      status: 503,
      json: {} as T,
      error: "TUDUDI_API_KEY not configured",
    };
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: init.method || "GET",
      headers,
      body,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    let json: T;
    try {
      json = (await res.json()) as T;
    } catch {
      return {
        ok: false,
        status: res.status,
        json: {} as T,
        error: `non-JSON response (${res.status})`,
      };
    }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      json: {} as T,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function statusLabel(status: number | string | null | undefined): string {
  const n = Number(status);
  if (n === 2 || status === "done" || status === "completed") return "done";
  if (n === 1 || status === "in_progress" || status === "doing") return "in_progress";
  return "not_started";
}

export async function listProjects(): Promise<{
  ok: boolean;
  projects: TududiProject[];
  error?: string;
}> {
  const res = await tududiFetch<{ projects?: TududiProject[] }>("/api/v1/projects");
  if (!res.ok) return { ok: false, projects: [], error: res.error || `HTTP ${res.status}` };
  return { ok: true, projects: res.json.projects || [] };
}

export async function listAreas(): Promise<{
  ok: boolean;
  areas: TududiArea[];
  error?: string;
}> {
  const res = await tududiFetch<{ areas?: TududiArea[] } | TududiArea[]>(`/api/v1/areas`);
  if (!res.ok) return { ok: false, areas: [], error: res.error || `HTTP ${res.status}` };
  // Tududi returns a bare array, not {areas:[...]}
  const json = res.json;
  const areas = Array.isArray(json) ? json : (json as { areas?: TududiArea[] }).areas || [];
  return { ok: true, areas };
}

export async function listTasks(opts: {
  project_id?: number;
  project_uid?: string;
  /** Tududi excludes done unless status is set; default all for progress counts. */
  status?: string;
}): Promise<{ ok: boolean; tasks: TududiTask[]; error?: string }> {
  const qs = new URLSearchParams();
  if (opts.project_id != null) qs.set("project_id", String(opts.project_id));
  if (opts.project_uid) qs.set("project_uid", opts.project_uid);
  qs.set("status", opts.status || "all");
  const path = `/api/v1/tasks?${qs}`;
  const res = await tududiFetch<{ tasks?: TududiTask[] }>(path);
  if (!res.ok) return { ok: false, tasks: [], error: res.error || `HTTP ${res.status}` };
  return { ok: true, tasks: res.json.tasks || [] };
}
