export const III_TASK_STATUSES = ["todo", "done"] as const;
export type IiiTaskStatus = (typeof III_TASK_STATUSES)[number];

export type IiiTask = {
  id: string;
  thread_id: string;
  title: string;
  status: IiiTaskStatus;
  sort_order: number;
  stage_id: string | null;
  acceptance_criteria: string[];
  dependencies: string[];
  assignee: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ThreadPlanRow = {
  id: string;
  thread_id: string;
  title: string;
  status: string;
  sort_order: number;
  stage_id: string | null;
  acceptance_criteria: string;
  dependencies: string;
  assignee: string | null;
  external_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const TASK_SELECT = `
  id, thread_id, title, status, sort_order, stage_id,
  acceptance_criteria, dependencies, assignee, external_id,
  created_at::text AS created_at, updated_at::text AS updated_at
`;

export function taskSelectSql(alias = ""): string {
  const p = alias ? `${alias}.` : "";
  return `
  ${p}id, ${p}thread_id, ${p}title, ${p}status, ${p}sort_order, ${p}stage_id,
  ${p}acceptance_criteria, ${p}dependencies, ${p}assignee, ${p}external_id,
  ${p}created_at::text AS created_at, ${p}updated_at::text AS updated_at
`.trim();
}

export { TASK_SELECT };

function parseJsonStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).filter(Boolean);
  }
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function asIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function rowToTask(row: ThreadPlanRow): IiiTask {
  const status = III_TASK_STATUSES.includes(row.status as IiiTaskStatus)
    ? (row.status as IiiTaskStatus)
    : "todo";
  return {
    id: String(row.id),
    thread_id: String(row.thread_id),
    title: String(row.title),
    status,
    sort_order: Number(row.sort_order) || 0,
    stage_id: row.stage_id == null ? null : String(row.stage_id),
    acceptance_criteria: parseJsonStringList(row.acceptance_criteria),
    dependencies: parseJsonStringList(row.dependencies),
    assignee: row.assignee == null || row.assignee === "" ? null : String(row.assignee),
    external_id: row.external_id == null || row.external_id === "" ? null : String(row.external_id),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
  };
}

export function parseStatus(value: unknown): IiiTaskStatus | null {
  if (typeof value !== "string") return null;
  return III_TASK_STATUSES.includes(value as IiiTaskStatus) ? (value as IiiTaskStatus) : null;
}

export function parseStringList(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be a list of strings`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

export function errorBody(error: string, code: "not_found" | "invalid" | "unauthorized" | "conflict") {
  return { ok: false as const, error, code };
}
