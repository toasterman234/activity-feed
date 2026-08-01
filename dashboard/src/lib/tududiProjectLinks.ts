import { extractAdPointer, parseConventions } from "./tududiConventions.ts";

/** Minimal repo shape needed to resolve Tududi → repo links. */
export type LinkableRepo = {
  id: string;
  name: string;
  path: string;
  git_remote?: string | null;
  exists_on_disk?: boolean;
  scaffold_detected?: boolean;
  active_thread_count?: number;
};

type TaskLike = {
  note?: string | null;
  repo?: string | null;
  tags?: Array<{ name?: string } | string> | null;
};

/** Collect raw repo hints from Tududi task conventions / AD pointers. */
export function collectRepoHints(tasks: TaskLike[]): string[] {
  const hints = new Set<string>();
  for (const task of tasks) {
    const note = String(task.note || "");
    const fromField = (task.repo || "").trim();
    if (fromField) hints.add(fromField);

    const c = parseConventions(note, task.tags);
    if (c.repo) hints.add(c.repo.trim());

    const pointer = extractAdPointer(note);
    if (pointer?.type === "repo" && pointer.id) hints.add(pointer.id);

    for (const m of note.matchAll(/\bad:repo:([a-zA-Z0-9_-]+)/g)) {
      hints.add(m[1]);
    }
  }
  return [...hints];
}

function basename(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

/** Match hints to registered repos by id, name, path, or path basename. */
export function matchRepos(hints: string[], repos: LinkableRepo[]): LinkableRepo[] {
  if (!hints.length || !repos.length) return [];
  const byId = new Map(repos.map((r) => [r.id, r]));
  const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]));
  const byPath = new Map(repos.map((r) => [r.path, r]));
  const byBase = new Map(repos.map((r) => [basename(r.path).toLowerCase(), r]));

  const found = new Map<string, LinkableRepo>();
  for (const raw of hints) {
    const hint = raw.trim();
    if (!hint) continue;
    const lower = hint.toLowerCase();
    const hit =
      byId.get(hint) ||
      byName.get(lower) ||
      byPath.get(hint) ||
      byBase.get(lower) ||
      byBase.get(basename(hint).toLowerCase());
    if (hit) found.set(hit.id, hit);
  }
  return [...found.values()];
}

export function resolveLinkedRepos(tasks: TaskLike[], repos: LinkableRepo[]): LinkableRepo[] {
  return matchRepos(collectRepoHints(tasks), repos);
}
