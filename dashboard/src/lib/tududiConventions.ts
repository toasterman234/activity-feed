/** Tududi planning conventions — keep in sync with ai-stack/iii-tududi/CONVENTIONS.md */

export const CONVENTION_TAGS = [
  "stage",
  "decision",
  "fork",
  "doc",
  "chosen",
  "rejected",
  "blocked",
  "question",
  "experiment",
  "scorecard",
] as const;

const MARKER_RE = /\[([a-z_]+):([^\]]+)\]/gi;

export type TaskConvention = {
  kind: string;
  stage: string | null;
  decision: string | null;
  fork_of: string | null;
  path: string | null;
  outcome: string | null;
  repo: string | null;
  blocked: boolean;
  tags: string[];
};

export function parseConventions(
  note?: string | null,
  tags: Array<{ name?: string } | string> | null | undefined = [],
): TaskConvention {
  const text = String(note || "");
  const markers: Record<string, string> = {};
  for (const m of text.matchAll(MARKER_RE)) {
    markers[m[1].toLowerCase()] = String(m[2]).trim();
  }

  const tagNames = (Array.isArray(tags) ? tags : [])
    .map((t) => (typeof t === "string" ? t : t?.name))
    .filter(Boolean)
    .map((n) => String(n).toLowerCase());

  let kind = (markers.kind || "").toLowerCase();
  if (!kind) {
    if (tagNames.includes("decision")) kind = "decision";
    else if (tagNames.includes("fork")) kind = "fork";
    else if (tagNames.includes("stage")) kind = "stage";
    else if (tagNames.includes("doc")) kind = "doc";
    else kind = "task";
  }

  const outcome =
    (markers.outcome || "").toLowerCase() ||
    (tagNames.includes("chosen")
      ? "chosen"
      : tagNames.includes("rejected")
        ? "rejected"
        : kind === "decision" || kind === "fork"
          ? "open"
          : null);

  return {
    kind,
    stage: markers.stage || null,
    decision: markers.decision || null,
    fork_of: markers.fork_of || null,
    path: markers.path || null,
    outcome,
    repo: markers.repo || null,
    blocked: tagNames.includes("blocked"),
    tags: tagNames,
  };
}

export function buildConventionNote(
  fields: Record<string, string | null | undefined>,
  body = "",
): string {
  const lines: string[] = [];
  for (const key of [
    "kind",
    "stage",
    "decision",
    "fork_of",
    "path",
    "outcome",
    "repo",
    "external_id",
  ]) {
    const v = fields[key];
    if (v != null && String(v).trim()) lines.push(`[${key}:${String(v).trim()}]`);
  }
  const rest = String(body || "").trim();
  if (rest) lines.push(rest);
  return lines.join("\n");
}

export function kindBadgeClass(kind: string): string {
  switch (kind) {
    case "decision":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "fork":
      return "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
    case "stage":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
    case "doc":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";
    default:
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }
}

/** Extract AD pointer from Tududi note (ad:thread:<id>, ad:repo:<id>, etc.) */
export function extractAdPointer(note: string): { type: string; id: string } | null {
  const m = note.match(/\bad:(thread|repo|channel|run):([a-zA-Z0-9_-]+)/);
  if (!m) return null;
  return { type: m[1], id: m[2] };
}
