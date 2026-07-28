# PLAN — Issues Channel (lifecycle-based, repo-targeted)

**Status:** shipped (issue lifecycle, issues list UI, repo targeting, work-runs control plane). Autonomous coding-worker transport remains deferred — see `.planning/issue-resolution-pipeline/`.
**Repo:** `/Users/bencharney/activity-feed/dashboard`

---

## 0. Goal (plain terms)

Add an **issues channel** to the activity dashboard. Issues are tracked work items
(bugs, tasks, feature requests) with a priority, an assignee, and a **target repo**.

The key requirement that shapes the whole design:

> An issue must be able to point at **any pre-existing repo on disk**, even one that
> is NOT a member of the channel and has never been a thread before.

We achieve this **without a parallel `issues` table**. Issues ARE threads (they live in
`thread_meta` like every other thread), so they reuse the entire existing thread
machinery: messages, plans, workflow steps, artifacts, and the lifecycle state engine.
We add:

1. A new **`repos` registry** table (target repos, independent of channel membership).
2. A new **`issue` lifecycle** in `lifecycles.ts`.
3. Four new columns on **`thread_meta`** (`priority`, `assignee`, `repo_id`, `labels`).
4. One **runtime change** so an issue's agent runs in its target repo's directory.
5. **UI**: an issues list view, a new-issue form with a repo picker, and an issue
   header on the thread detail page.

### Non-goals / decisions already made
- **No separate `issues` table.** State lives in `thread_meta.state` only (one source of truth).
- **Registering a repo does NOT auto-add it as a channel `project` member.** The
  `repos` registry is fully independent of `channel_members`. (Confirmed with Ben.)
- Repo picker = **pick from the `repos` registry** (register once, then reuse). No
  free-form arbitrary path typing in v1.
- **Kanban is out of scope for v1** (hard on mobile). List view only.

---

## 1. Architecture context (read before coding)

The dashboard is a Next.js app. Data lives in **Postgres** (source of truth) and is
replicated **one-way** out to the browser via electric-circuits shapes.

- **Writes** go directly to Postgres through API routes using `pool` from
  `src/app/api/_db.ts`. Never write through the electric client — see the comment in
  `_db.ts`. The central write route is `src/app/api/channels/write/route.ts`.
- **Reads** in the browser come from electric shapes (live long-poll) OR from
  `client.query({ table, where })` one-shot polls. See `src/app/channels/shapes.ts`.
- **The electric schema** every table must be declared in `src/app/schema.ts`, and a
  shape def added in `src/app/electric.ts`, or the browser cannot read it.
- **Lifecycle engine** lives in `src/app/channels/lifecycles.ts`. It is validated at
  dev time by `validateLifecycles()`. Transitions are enforced server-side in
  `channels/write/route.ts` (via `canTransition`) and in `channels/trigger/route.ts`.
- **Agent runs** happen in `src/app/api/channels/trigger/route.ts` — `runMentionJob`
  shells out to `pi`. The working directory is currently derived from the channel's
  project member by `resolveCwd()` (line ~93), using a **hardcoded path map**.

⚠️ **There are no migration files in this repo.** Tables were created directly in
Postgres. So "migration" here means: run the DDL against the Postgres DB
(`ACTIVITY_DB_URL`, default `postgres://activity:activity@localhost:5433/activity_log`),
AND update `schema.ts` so electric knows the columns exist. Do BOTH or the feature
half-works (DB has data, browser can't see it — or vice versa).

---

## 2. Database changes

### 2.1 New `repos` table

Apply this DDL to Postgres:

```sql
CREATE TABLE IF NOT EXISTS repos (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,          -- short label, e.g. "ax-brain-crew"
  path        TEXT NOT NULL,          -- absolute path on disk, e.g. /Users/bencharney/ax-brain-crew
  git_remote  TEXT,                   -- optional, e.g. git@github.com:...
  created_at  TEXT NOT NULL
);
```

### 2.2 New columns on `thread_meta`

```sql
ALTER TABLE thread_meta ADD COLUMN IF NOT EXISTS priority TEXT;   -- none|low|medium|high|urgent
ALTER TABLE thread_meta ADD COLUMN IF NOT EXISTS assignee TEXT;   -- agent/person handle
ALTER TABLE thread_meta ADD COLUMN IF NOT EXISTS repo_id  TEXT;   -- FK into repos.id (nullable)
ALTER TABLE thread_meta ADD COLUMN IF NOT EXISTS labels   TEXT;   -- JSON array string, default '[]'
```

All nullable so existing coding/research/planning threads are unaffected.

### 2.3 Declare in electric schema — `src/app/schema.ts`

Add a `repos` table block to `schema.tables`:

```ts
repos: {
  columns: {
    id:         { type: "text" },
    name:       { type: "text" },
    path:       { type: "text" },
    git_remote: { type: "text" },
    created_at: { type: "text" },
  },
  primaryKey: "id",
},
```

Extend the existing `thread_meta` block's `columns` with the four new columns:

```ts
priority: { type: "text" },
assignee: { type: "text" },
repo_id:  { type: "text" },
labels:   { type: "text" },
```

### 2.4 Add a shape def — `src/app/electric.ts`

```ts
export const REPOS_SHAPE: ShapeDef = { table: "repos" };
```

---

## 3. Lifecycle: add `issue` to `src/app/channels/lifecycles.ts`

Add this entry to the `LIFECYCLES` object (leave `DEFAULT_LIFECYCLE = "coding"`).
`validateLifecycles()` will confirm it is well-formed — run it.

```ts
issue: {
  label: "Issue", initial: "open",
  states: {
    open:        { label: "Open",        kind: "start" },
    triaged:     { label: "Triaged",     kind: "active" },
    in_progress: { label: "In progress", kind: "active" },
    blocked:     { label: "Blocked",     kind: "wait" },
    resolved:    { label: "Resolved",    kind: "proven" },
    closed:      { label: "Closed",      kind: "done", terminal: true },
    wont_fix:    { label: "Won't fix",   kind: "dead", terminal: true },
  },
  transitions: {
    open:        ["triaged", "wont_fix"],
    triaged:     ["in_progress", "blocked", "wont_fix"],
    in_progress: ["resolved", "blocked", "wont_fix"],
    blocked:     ["in_progress", "wont_fix"],
    resolved:    ["closed", "in_progress"],   // reopen if verify fails
    closed:      [],
    wont_fix:    [],
  },
  workflows: {
    "categorize": { label: "Categorize", runsAt: "open", kind: "prompt",
      instruction: "Classify this issue (bug/task/feature), set a priority, and confirm which repo it targets.",
      defaultOn: true },
    "scope-repo": { label: "Scope in repo", runsAt: "triaged", kind: "prompt",
      instruction: "Explore the target repo and identify the files/areas this issue affects. Write a thread plan of concrete steps." },
    "fix":        { label: "Implement fix", runsAt: "in_progress", kind: "prompt",
      instruction: "Implement the fix in the target repo. Keep changes minimal and follow the repo's conventions." },
    "verify-fix": { label: "Verify fix", runsAt: "resolved", kind: "command",
      command: "npm test", gates: true },
  },
},
```

Notes:
- `verify-fix` gates the `resolved` state: if `npm test` fails in the target repo,
  the existing gating logic in `trigger/route.ts` drops the thread to `failed` —
  BUT the `issue` lifecycle has no `failed` state, so the gate falls back to keeping
  `currentState` (see `trigger/route.ts` line ~333: `const failState = lc.states.failed ? "failed" : currentState`). That is the desired behavior — verification failure keeps it in `in_progress`/`resolved` rather than an illegal state. Confirm this during testing.
- If `npm test` is not the right verify command for arbitrary repos, this is a known
  limitation for v1 — the command is lifecycle-global, not per-repo. See §7 Open items.

---

## 4. Runtime: make an issue's agent run in its target repo

**File:** `src/app/api/channels/trigger/route.ts`

Currently `runMentionJob` receives `cwd` computed once per request by
`resolveCwd(channelId)` (line ~427, from the channel's project member via a hardcoded
map). For issues we want the cwd to come from the issue's **`repo_id` → `repos.path`**.

### 4.1 Add a repo resolver

Add near `resolveCwd`:

```ts
async function resolveRepoCwd(threadId: string): Promise<string | null> {
  try {
    const res = await pool.query(
      `SELECT r.path
         FROM thread_meta tm
         JOIN repos r ON r.id = tm.repo_id
        WHERE tm.thread_id = $1`,
      [threadId],
    );
    return (res.rows[0]?.path as string) || null;
  } catch {
    return null;
  }
}
```

### 4.2 Prefer the repo cwd inside `runMentionJob`

Inside `runMentionJob`, BEFORE building `runArgs` (right where it currently sets
`cwd = opts.cwd;` in the non-research branch, line ~237), resolve the repo override:

```ts
const repoCwd = await resolveRepoCwd(opts.threadId);
const effectiveCwd = repoCwd || opts.cwd;
```

Then use `effectiveCwd` everywhere `cwd` / `opts.cwd` is used in this function:
- the `pi` exec `cwd` (line ~237/248),
- the command-workflow exec `cwd` (line ~310) — this is what makes `verify-fix`
  (`npm test`) run in the **target repo**.

⚠️ Do NOT break the research-tools branch (`researchToolsEnabled`) — it sets its own
sandboxed `cwd` via `buildResearchInvocation`. Only override cwd in the normal
(non-research) path, or guard: `if (lifecycleKey !== "research") cwd = effectiveCwd;`.

### 4.3 Safety
- If `repo_id` is set but the path does not exist on disk, `execFile` throws ENOENT.
  Add a cheap existence guard (`fs.existsSync(effectiveCwd)`) and, if missing, post a
  system message ("target repo path not found: …") and skip the run rather than
  crashing the job. Keep it minimal.

---

## 5. API routes

### 5.1 New route: `src/app/api/repos/route.ts`

CRUD for the registry. Follow the pattern of `channels/write/route.ts` (direct
`pool.query`, JSON in/out).

- `POST` — register a repo. Body `{ name, path, git_remote? }`. Generate `id` with
  `randomUUID()`, `created_at = new Date().toISOString()`. Insert into `repos`.
  Validate `path` is absolute (`path.isAbsolute`). Optionally `fs.existsSync` check
  and warn (don't hard-block — repo could be on a different host).
- `GET` — list repos (`SELECT * FROM repos ORDER BY name`).
- `DELETE` — remove by `id` (optional for v1). If deleting, note that any
  `thread_meta.repo_id` pointing at it becomes dangling; leave it (resolver returns
  null → falls back to channel cwd).

Do NOT touch `channel_members` here — the registry is independent (Ben's decision).

### 5.2 Extend `channels/write/route.ts` for the new `thread_meta` columns

The current `thread_meta` branch (line ~64) does not persist `priority`, `assignee`,
`repo_id`, or `labels`. Extend the INSERT ... ON CONFLICT to include them. Preserve
the existing `canTransition` enforcement and `_lifecycle_switch` logic exactly.

Updated upsert (add the four columns, `COALESCE` on update so partial writes don't
wipe fields):

```ts
await pool.query(
  `INSERT INTO thread_meta
     (thread_id, channel_id, lifecycle, state, enabled_workflows, research_mode,
      priority, assignee, repo_id, labels, updated_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
   ON CONFLICT (thread_id) DO UPDATE SET
     lifecycle         = COALESCE($3, thread_meta.lifecycle),
     state             = COALESCE($4, thread_meta.state),
     enabled_workflows = COALESCE($5, thread_meta.enabled_workflows),
     research_mode     = COALESCE($6, thread_meta.research_mode),
     priority          = COALESCE($7, thread_meta.priority),
     assignee          = COALESCE($8, thread_meta.assignee),
     repo_id           = COALESCE($9, thread_meta.repo_id),
     labels            = COALESCE($10, thread_meta.labels),
     updated_at        = $11`,
  [ r.thread_id, r.channel_id, r.lifecycle, r.state,
    String(r.enabled_workflows ?? "[]"),
    (r.research_mode as string | undefined) ?? null,
    (r.priority as string | undefined) ?? null,
    (r.assignee as string | undefined) ?? null,
    (r.repo_id as string | undefined) ?? null,
    (r.labels as string | undefined) ?? null,
    r.updated_at || new Date().toISOString() ],
);
```

---

## 6. UI

### 6.1 Data hooks — `src/app/channels/shapes.ts`

- Extend `ThreadMetaRow` interface with `priority: string | null; assignee: string | null; repo_id: string | null; labels: string | null;`.
- Add a `RepoRow` interface `{ id; name; path; git_remote: string | null; created_at }`.
- Add `getReposShape()/releaseReposShape()` (refcounted, like `getChannelShape`) OR
  simply fetch `GET /api/repos` where a live stream is overkill (the registry changes
  rarely — a one-shot fetch in the form is fine and cheaper on the shape budget; note
  ADR-003 caps live shapes per page). **Prefer a plain `fetch('/api/repos')`** in the
  form/list rather than holding another live shape.

### 6.2 Issues list view

When a channel's `default_lifecycle === "issue"`, render an issues-first view instead
of the chat-first `ChannelsContent` layout. Each row = one thread whose
`thread_meta.lifecycle === "issue"`:

```
[priority badge]  Title (thread root message body, first line)   ·  state  ·  @assignee  ·  repoName
```

- Priority badge colors: urgent=red, high=orange, medium=yellow, low=gray, none=muted.
- Group or sort by state (open → triaged → in_progress → blocked → resolved → closed).
- Clicking a row opens the existing thread detail page (`[channelId]/[threadId]`).
- Wire this in `ChannelsContent.tsx` / the `[channelId]/page.tsx` — branch on
  `channel.default_lifecycle === "issue"`.

### 6.3 New-issue form

A form (modal or inline) that creates an issue thread. On submit:

1. `POST /api/channels/write` `{ table: "messages", row: {...} }` — create the root
   message (id = `randomUUID()`, `thread_id` = same id as the message = thread root,
   body = title + description). Follow how a new thread root is created elsewhere.
2. `POST /api/channels/write` `{ table: "thread_meta", row: { thread_id, channel_id,
   lifecycle: "issue", state: "open", priority, assignee, repo_id, labels,
   enabled_workflows: JSON of default-on workflow ids } }`.
   - Use `defaultEnabledWorkflows("issue")` from `lifecycles.ts` for the workflow ids.

Form fields:
- **Title** (required)
- **Description** (textarea → part of root message body)
- **Priority** (select: none/low/medium/high/urgent)
- **Repo** (select, **populated from `GET /api/repos`**) — this sets `repo_id`
- **Assignee** (optional; agent handle or person)

Add a small **"+ Register repo"** affordance next to the repo select that POSTs to
`/api/repos` (name + absolute path) and refreshes the list — so a brand-new repo can
be added inline without leaving the form.

### 6.4 Issue header on thread detail

On the thread detail page, when `meta.lifecycle === "issue"`, render a header block
above the messages: priority badge, state (reuse `StateFlow.tsx`), assignee, and the
target repo name + path. Editing priority/assignee/repo posts a `thread_meta` write.

---

## 7. Open items / known v1 limitations (call out, don't silently skip)

1. **`verify-fix` command is global, not per-repo.** It runs `npm test`. Repos that
   use a different test command won't verify correctly. v2 could store a
   `test_command` on the `repos` row and have the runtime use it. For v1, document
   this; consider making `verify-fix` NOT `defaultOn` so it's opt-in per issue.
2. **`resolveCwd` hardcoded map** (`trigger/route.ts` line ~111) still exists for
   non-issue threads. Not required to change, but the `repos` registry could later
   replace it. Leave as-is for this PR.
3. **Deleting a repo** leaves dangling `repo_id`s — resolver falls back to channel
   cwd, which is safe. No cascade needed for v1.
4. **Labels** column is added but the UI for it is optional in v1 (add filter/label
   chips later if wanted).

---

## 8. Implementation order (suggested)

1. DB: apply DDL (§2.1, §2.2). Update `schema.ts` + `electric.ts` (§2.3, §2.4).
2. Lifecycle: add `issue` to `lifecycles.ts`; run `validateLifecycles()` (§3).
3. Runtime: `resolveRepoCwd` + cwd override in `trigger/route.ts` (§4).
4. API: `repos` route (§5.1); extend `thread_meta` write (§5.2).
5. UI: hooks (§6.1) → new-issue form + repo picker (§6.3) → issues list (§6.2) →
   detail header (§6.4).
6. Create a channel with `default_lifecycle = "issue"` and test end-to-end.

---

## 9. Acceptance test (browser-checked — mandatory per house rules)

Do all of these in a real browser (Interceptor), not just from code:

1. Register a repo (e.g. `ax-brain-crew` → `/Users/bencharney/ax-brain-crew`) via the
   form. Confirm it appears in the repo picker AND is NOT added as a channel member.
2. Create an issue in an issues channel targeting that repo. Confirm it shows in the
   list with the right priority badge, state `open`, and repo name.
3. @mention an agent in the issue thread. Confirm the agent's run happens **in the
   target repo's directory** (verify via a workflow step / artifact that echoes cwd or
   touches a repo file), not the channel's default cwd.
4. Walk the state machine: open → triaged → in_progress → resolved. Confirm illegal
   transitions are rejected (409) and `verify-fix` runs `npm test` in the target repo.
5. Confirm existing coding/research/planning channels are completely unaffected.
```
