// Heal bare issue metadata on thread open — default owner to "you",
// infer repo from Work: <name>-style titles.
// Pure functions + one async apply. No side effects in the pure path.

export const DEFAULT_ISSUE_OWNER = "you";

/** Extract a repo-name hint from a title like "Work: activity-feed". */
export function inferRepoHintFromTitle(title: string): string | null {
  const t = (title || "").trim();
  if (!t) return null;

  // "Work: name" or "Work - name"
  const m = t.match(/^Work\s*[:–—-]\s*(.+)$/i);
  if (m?.[1]) {
    const hint = m[1].trim();
    // only return if it looks like a repo name, not a whole sentence
    if (hint.length >= 2 && hint.length <= 80 && /^[a-zA-Z0-9._-]+$/.test(hint)) {
      return hint;
    }
  }

  // Fallback: if the title itself looks like a single repo-name token
  if (/^[a-zA-Z][a-zA-Z0-9._-]+$/.test(t) && t.length <= 80) {
    return t;
  }

  return null;
}

/** Match a repo hint against a list of repos — case-insensitive name match,
 *  then path basename match. */
export function matchRepo(
  hint: string,
  repos: Array<{ id: string; name: string; path?: string | null }>,
): { id: string; name: string } | null {
  const h = hint.toLowerCase();

  // exact case-insensitive name match first
  for (const r of repos) {
    if (r.name.toLowerCase() === h) return { id: r.id, name: r.name };
  }

  // path basename match (e.g. "~/Projects/activity-feed" → "activity-feed")
  for (const r of repos) {
    if (!r.path) continue;
    const base = r.path.split("/").pop() || "";
    if (base.toLowerCase() === h) return { id: r.id, name: r.name };
  }

  // partial name contains (looser)
  for (const r of repos) {
    if (r.name.toLowerCase().includes(h)) return { id: r.id, name: r.name };
  }

  return null;
}

export type HealPatch = { assignee?: string; repo_id?: string };

/** Given current thread metadata + known repos, return a patch of defaults
 *  to persist. Returns null if nothing needs healing. */
export function proposeIssueMetaHeal(input: {
  lifecycle: string;
  state: string;
  title: string;
  assignee: string | null;
  repoId: string | null;
  repos: Array<{ id: string; name: string; path?: string | null }>;
}): HealPatch | null {
  // Only heal issue/open threads
  if (input.lifecycle !== "issue") return null;
  if (input.state !== "open") return null;

  const patch: HealPatch = {};

  // Default owner
  if (!(input.assignee || "").trim()) {
    patch.assignee = DEFAULT_ISSUE_OWNER;
  }

  // Infer repo from title
  if (!input.repoId) {
    const hint = inferRepoHintFromTitle(input.title);
    if (hint) {
      const match = matchRepo(hint, input.repos);
      if (match) patch.repo_id = match.id;
    }
  }

  if (!patch.assignee && !patch.repo_id) return null;
  return patch;
}
