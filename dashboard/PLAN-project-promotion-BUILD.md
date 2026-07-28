# BUILD SPEC — Promote thread to AIWG project (for pi)

**Status:** shipped (core promote path) — retained as historical build spec. AIWG-aware project detail still open in `PLAN-project-detail-aiwg.md`.

Self-contained implementation plan. Design rationale lives in `PLAN-project-promotion.md`;
this doc is the actionable build. Work in `/Users/bencharney/activity-feed/dashboard`.
Do the phases in order — each is independently verifiable. Commit after each phase.

Depends on `PLAN-lifecycles.md` / `PLAN-lifecycles-BUILD.md` (lifecycle system already built).
Builds on: `write/route.ts`, `trigger/route.ts`, `_db.ts`, `shapes.ts`, `lifecycles.ts`.

## ⚠️ CRITICAL GOTCHAS (same ones that already bit us)
1. **New DB tables MUST be added to the engine allowlist.** File:
   `electric-circuits/docker/compose.activity-feed.yaml`, env `ELECTRIC_CIRCUITS_PG_TABLES`.
   After ANY schema change, recreate the engine (ASK BEN FIRST).
2. **DB access:** use `pool` from `_db.ts` (node `pg`). DSN already configured.
3. **Poll, don't stream.** Promotion status is polled by `useThreadExtras` — no new live shapes.
4. **Mobile-first UI.** The promote button/dialog must work on narrow screens.
5. **Fire-and-forget.** The API route starts the job and returns immediately; status rows
   track progress; the UI polls.

## Settled decisions (baked into this spec)
- **aiwg version:** pinned to `2026.7.19` (currently installed). Upgrading is a deliberate change.
- **Temp dir:** `os.tmpdir()/promote-<uuid>` with atomic cleanup (delete on failure, move to
  destination on success).
- **Agent population:** one `pi -p` call per promotion, same pattern as `trigger/route.ts`
  but with a different system prompt (AIWG doc-filling, not chat reply).
- **Secret scrubbing:** regex pass on agent output before git commit — strip patterns like
  `sk-...`, `Bearer ...`, `-----BEGIN...-----` blocks, `API_KEY=...`, `token=...`.
- **Large threads:** if thread transcript > 60K chars, run a summarization pass first via
  a separate pi call, then feed the summary to the populate agent.
- **Destination:** user provides a local path via the UI dialog. Push to remote is out of
  scope for v1 (TBD per PLAN). Just the local repo scaffold + commit.
- **CI templates:** auto-detect from destination — for now, always copy GitHub CI templates
  (only target that makes sense with `--no-agents`). If we add GitLab/Gitea later, it'll
  be a parameter.

---

## PHASE 0 — Data model (SQL + schema + allowlist)

### 0a. Add columns to `thread_meta`
```sql
ALTER TABLE thread_meta ADD COLUMN IF NOT EXISTS promoted_to TEXT;
ALTER TABLE thread_meta ADD COLUMN IF NOT EXISTS archived_at TEXT;
```

### 0b. New `thread_promotions` audit table
```sql
CREATE TABLE IF NOT EXISTS thread_promotions (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  repo_path TEXT,
  status TEXT NOT NULL DEFAULT 'running',  -- running | succeeded | failed_required_gate | errored
  error_detail TEXT,
  agent_provider TEXT,
  agent_model TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
```

### 0c. Update `schema.ts`
- Add `promoted_to: { type: "text" }`, `archived_at: { type: "text" }` to `thread_meta` columns.
- Add `thread_promotions` table with all columns (all text).

### 0d. Update `electric.ts`
- Add `THREAD_PROMOTIONS_SHAPE` (not held live, just for query reference — same as THREAD_META_SHAPE).

### 0e. Engine allowlist
- Add `thread_promotions` to `ELECTRIC_CIRCUITS_PG_TABLES`. **ASK BEN before recreating engine.**

### 0f. Update `writeChannelRow.ts`
- Add `"thread_promotions"` to the union table type (even though writes go through the
  promote route directly, keeping the union complete avoids confusion).

### 0g. Update `shapes.ts`
- Add `ThreadPromotionRow` interface: `{ id; thread_id; repo_path; status; error_detail; agent_provider; agent_model; created_at; completed_at }`.
- Extend `useThreadExtras` to also poll `thread_promotions WHERE thread_id = $1` and
  return `promotion: ThreadPromotionRow | null` (most recent, by `created_at DESC LIMIT 1`).

**Verify:** `npx tsc --noEmit` passes. Node script inserts a `thread_promotions` row and
reads it back via `client.query`.

---

## PHASE 1 — Promote API route (`src/app/api/channels/promote/route.ts`)

New route: `POST /api/channels/promote`

### Request body
```ts
{ threadId: string; channelId: string; destinationPath: string }
```

### Flow (each step in order)

1. **Idempotency guard** — query `thread_meta` for this `threadId`. If `promoted_to` is
   already set → 409 `{ error: "already promoted", promotedTo }`. Query
   `thread_promotions` for any `running` row → 409 `{ error: "promotion already in progress" }`.

2. **Gather thread data** (deterministic, no LLM):
   - Root message: `SELECT body, author, created_at FROM messages WHERE id = $1 AND channel_id = $2`
   - All replies: `SELECT author, body, created_at FROM messages WHERE thread_id = $1 ORDER BY created_at`
   - Plans: `SELECT title, status FROM thread_plans WHERE thread_id = $1 ORDER BY sort_order`
   - Steps: `SELECT step_label, status, detail FROM thread_workflow_steps WHERE thread_id = $1`
   - Artifacts: `SELECT title, kind, content, version FROM thread_artifacts WHERE thread_id = $1`
   - Meta: `SELECT lifecycle, state FROM thread_meta WHERE thread_id = $1`

3. **Derive project name** — sanitize the root message's first line (or first 60 chars):
   - Replace `[^a-zA-Z0-9._-]` with `-`, collapse multiple dashes, trim dashes, lowercase.
   - Cap at 64 chars. If empty, use `promoted-thread-<threadId.slice(0,8)>`.

4. **Insert promotion row** — `status: 'running'`, `created_at` = now.

5. **Scaffold in temp dir**:
   - Create `os.tmpdir()/promote-<uuid>`.
   - Run `aiwg new <project-name> --no-agents` in that dir (cwd = temp dir).
   - Copy CI templates: `cp -r <aiwg-install-path>/ci/github/workflows <temp-dir>/.github/workflows`
     (where `<aiwg-install-path>` = `$(dirname $(which aiwg))/../lib/node_modules/aiwg`).

6. **Agent population** — three parts:

   a. **Summarize if large.** Build the full transcript string (root + replies). If > 60K chars:
      - Call `pi -p --no-tools --no-session --thinking off --provider <provider> --model <model>`
        with a summarization prompt. Use `execFileNoStdin` from `trigger/route.ts` / `src/lib/execFileNoStdin.ts` (never raw `execFile` — see ADR-006).
      - Store the summary; use it instead of the raw transcript for step (c).

   b. **Populate AIWG docs.** Call `pi -p --no-tools --no-session --thinking off` with a
      system prompt that instructs the agent to fill AIWG template files. The prompt
      includes the transcript/summary, plans, steps, artifacts, and lists each file that
      needs to be filled. The agent returns a JSON object:
      ```ts
      {
        "files": { "<relative-path>": "<file-content>", ... },
        "missingRequired": string[]  // sections marked REQUIRED that couldn't be filled
      }
      ```
      Only fill files that are part of the AIWG scaffold:
      - `.aiwg/intake/project-intake.md`
      - `.aiwg/requirements/` (any `.md` files found)
      - `.aiwg/decisions/` (any `.md` files found)
      - `.aiwg/security/threat-model.md` (only if lifecycle touched security states)

   c. **REQUIRED-section gate.** If `missingRequired.length > 0`:
      - Update promotion row: `status = 'failed_required_gate'`,
        `error_detail = JSON.stringify(missingRequired)`, `completed_at = now`.
      - Delete temp dir. Return 200 `{ status: "failed_required_gate", missingRequired }`.
      - Do NOT archive the thread.

7. **Write populated files** — for each file in the agent response, write it to the temp dir.

8. **Scrub secrets** — read each written `.md` file, run regex scrub pass, write back:
   - `/(sk-[a-zA-Z0-9]{20,})/g` → `[REDACTED]`
   - `/(Bearer\s+[a-zA-Z0-9._-]{10,})/g` → `Bearer [REDACTED]`
   - `/-----BEGIN[^-]*PRIVATE KEY-----[^-]*-----END[^-]*-----/gs` → `[REDACTED KEY]`
   - `/([A-Z_]{3,30}\s*=\s*['"]?[a-zA-Z0-9+/=]{20,}['"]?)/g` → `$1_REDACTED`
   - `/(gh[pousr]_[a-zA-Z0-9]{20,})/g` → `[REDACTED_TOKEN]`

9. **Init + commit** (aiwg already ran `git init`):
   - `git add -A` (inside temp dir, safe — it's a throwaway scaffold).
   - `git commit -m "Promoted from activity-feed thread ${threadId}"`.
   - Verify: `git rev-parse HEAD` succeeds.

10. **Move to destination**:
    - `mv <temp-dir> <destinationPath>/<project-name>` (or `cp -r` if cross-filesystem).
    - Verify the destination has a `.git` dir and the commit exists.

11. **Success** — update DB:
    - `thread_meta`: set `promoted_to = '<destinationPath>/<project-name>'`,
      `archived_at = now()`.
    - `thread_promotions`: set `status = 'succeeded'`,
      `repo_path = '<destinationPath>/<project-name>'`, `completed_at = now()`.

12. **Cleanup** — delete temp dir (it was moved, so just `rm -rf` for safety).

### Error handling
- Any error after step 4 → update promotion row `status = 'errored'`,
  `error_detail = <error message>`, `completed_at = now()`. Delete temp dir if it exists.
  Do NOT archive the thread, do NOT set `promoted_to`.
- Return 200 with `{ status: "errored", error: <message> }` so the UI can show it.
  (200, not 500 — the response itself succeeded; the promotion is tracked via its row.)

### Implementation notes
- Use the same `pool` from `_db.ts`.
- For `pi`, use `execFileNoStdin` (same as `trigger/route.ts`). Do **not** use `execFileAsync` for `pi` — see ADR-006.
- Provider/model: use `piInvocationForHandle("pi")` or default to
  `provider: process.env.CHANNEL_PI_PROVIDER || "anthropic"`,
  `model: process.env.CHANNEL_PI_MODEL || "claude-sonnet-4-20250514"`.
- `aiwg` binary path: resolve from `which aiwg` or hardcode
  `/Users/bencharney/.nvm/versions/node/v24.16.0/bin/aiwg`.
- CI templates source: `/Users/bencharney/.nvm/versions/node/v24.16.0/lib/node_modules/aiwg/ci/github/workflows`.
- Timeout: 300s for the whole route (set via `export const maxDuration = 300` in route segment config).

**Verify:** curl the endpoint with a test thread — check temp dir gets created, aiwg
scaffolds, files populated, commit made, and promotion row updated. Then run a second
time to confirm idempotency guard fires 409.

---

## PHASE 2 — UI (thread page promote button + dialog)

### 2a. Promote button
In `ThreadContent` (below the StateFlow panel, above the plan panel), add a "Promote to
Project" button. Placement: right after the `{lifecyclePicked && <StateFlow .../>}` block.

**Visibility gating:**
- Only show if `lifecyclePicked` is true AND the thread is in a terminal state OR the
  user clicked "promote anyway".
- Terminal detection: `LIFECYCLES[lifecycleKey].states[currentState]?.terminal === true`.
- If not terminal: show a smaller, muted "Promote anyway" link that, when clicked,
  shows a confirm then reveals the normal promote button.

### 2b. Promote dialog
When the button is clicked, show a simple dialog (inline, not a modal library):
- **Destination path** text input (default: `~/Projects/<project-name>` derived from
  the sanitized thread title).
- **Summary** of what will happen (reads like "Scaffold AIWG project from this thread's
  messages, plans, and artifacts — one-shot, no live sync back.").
- **Promote** button (disabled if no path) and **Cancel**.

### 2c. Promotion status
After clicking Promote:
- Call `POST /api/channels/promote` with `threadId`, `channelId`, `destinationPath`.
- The API returns immediately with `{ status: "running" }`.
- The UI shows a status pill: "Promoting…" (pulsing amber).
- `useThreadExtras` now returns `promotion` row — watch its status:
  - `running` → show "Promoting…" pill
  - `succeeded` → show "Promoted → <path>" (green), hide the promote button
  - `failed_required_gate` → show "Incomplete — <N> sections unfilled" (red),
    offer a "Force promote" option that re-runs skipping the REQUIRED gate
  - `errored` → show "Failed — <error>" (red), offer "Retry"

### 2d. Thread archived indicator
When `meta.promoted_to` is set and `meta.archived_at` is set, show a banner at the top:
"This thread was promoted to a project and is now archived (read-only)."
Disable the reply input.

**Verify (browser + phone):** Promote a terminal thread, watch the dialog, see status
updates, confirm archived banner appears. Force a failure (bad path) and confirm error UI.
Test "promote anyway" from a non-terminal state.

---

## PHASE 3 — Edge cases & robustness

### 3a. Idempotency (already handled in phase 1, verify)
- Double-click protection: the API returns 409 if `promoted_to` is already set or a
  `running` promotion exists.
- UI: disable the button immediately after click, before the API responds.

### 3b. Project name collision
- If `destinationPath/project-name` already exists, the `mv` in step 10 will fail.
  Before scaffolding, check: `fs.existsSync(destinationPath/project-name)`.
  If exists → update promotion row `status = 'errored'`,
  `error_detail = 'Destination already exists: <path>'`. Return to UI.

### 3c. aiwg template paths
- Hardcode the expected template paths. After `aiwg new --no-agents`, verify they exist
  before the agent populates them. If any expected file is missing, error early.

### 3d. Temp dir cleanup on process exit
- Register `process.on('exit', ...)` to clean up temp dir. Also wrap the main logic in
  try/finally.

### 3e. Push auth (deferred)
- Per PLAN: pushing to remote is TBD. v1 only does local scaffold + commit.
  Document in the UI that push is a manual next step: `cd <path> && git remote add origin <url> && git push`.

**Verify:** run through each edge case manually — collision, empty thread, thread with
no artifacts/plans, large thread (>100 messages).

---

## PHASE 4 — Full verification (MANDATORY)
Use the real PWA (localhost:3000 AND phone via Tailscale `http://100.71.118.10:3000`).
Confirm, with screenshots + console/network check:
- Promote button appears only for terminal-state threads (and "promote anyway" for others).
- Dialog collects destination path and shows summary.
- Promotion runs: temp dir created, aiwg scaffolds, agent populates docs, commit made,
  moved to destination.
- DB: `thread_meta.promoted_to` set, `archived_at` set, `thread_promotions` row = `succeeded`.
- Thread page shows archived banner, reply input disabled.
- Idempotency: second promote click returns 409 (or button is disabled).
- Required-section gate: test with a deliberately sparse thread — confirm it stops and
  reports missing sections.
- Mobile: dialog fits on narrow screen, button reachable.
- No console errors, no layout breakage.
Clean up test rows + test repos afterward.

## Out of scope (do NOT do now)
- Remote push (GitHub/GitLab/Gitea) — user does it manually.
- Live sync from project back to thread.
- AIWG agent/command deployment (`--no-agents` is the only mode).
- Multi-project promotion (one thread → multiple repos).
- Promoting from a thread that has no lifecycle picked (require lifecycle first).
