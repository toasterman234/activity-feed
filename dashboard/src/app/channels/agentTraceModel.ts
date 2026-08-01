import type { ActivityEventRow } from "./shapes";

export type AgentTraceStep = {
  id: string;
  kind: "thinking" | "tool" | "status";
  title: string;
  status: "running" | "done" | "error" | "idle";
  detail: string;
  startedAt: string;
  updatedAt: string;
  eventCount: number;
};

function normalizeStatus(status: string): AgentTraceStep["status"] {
  if (status === "running" || status === "done" || status === "error") return status;
  return "idle";
}

function cleanToolLabel(label: string): string {
  return label.replace(/^(calling|ran)\s+/, "").trim() || "Tool";
}

function titleFor(event: ActivityEventRow): string {
  if (event.kind === "thinking") return event.status === "done" ? "Reasoned" : "Thinking";
  if (event.kind === "tool") return cleanToolLabel(event.label);
  return event.label || "Status";
}

function mergeDetail(a: string, b: string): string {
  const left = a.trim();
  const right = b.trim();
  if (!left) return right;
  if (!right || left === right) return left;
  return `${left}\n\n${right}`;
}

export function buildAgentTraceSteps(events: ActivityEventRow[]): AgentTraceStep[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const steps: AgentTraceStep[] = [];

  for (const event of sorted) {
    const status = normalizeStatus(event.status);
    const title = titleFor(event);
    const detail = event.detail || "";
    const last = steps[steps.length - 1];

    const shouldMergeThinking =
      event.kind === "thinking" &&
      last?.kind === "thinking";

    const shouldMergeTool =
      event.kind === "tool" &&
      last?.kind === "tool" &&
      last.title === title;

    if (shouldMergeThinking || shouldMergeTool) {
      last.status = status === "error" ? "error" : status === "running" ? "running" : last.status === "error" ? "error" : status;
      last.detail = mergeDetail(last.detail, detail);
      last.updatedAt = event.updated_at || event.created_at;
      last.eventCount += 1;
      continue;
    }

    steps.push({
      id: event.id,
      kind: event.kind === "tool" ? "tool" : event.kind === "status" ? "status" : "thinking",
      title,
      status,
      detail,
      startedAt: event.created_at,
      updatedAt: event.updated_at || event.created_at,
      eventCount: 1,
    });
  }

  return steps;
}

export function summarizeAgentTrace(steps: AgentTraceStep[], running: boolean): string {
  if (steps.length === 0) return "";
  const completed = steps.filter((step) => step.status === "done").length;
  const errored = steps.filter((step) => step.status === "error").length;
  if (running) return `${steps.length} live step${steps.length === 1 ? "" : "s"}`;
  if (errored > 0) return `${completed}/${steps.length} completed · ${errored} error${errored === 1 ? "" : "s"}`;
  return `${completed}/${steps.length} completed`;
}
