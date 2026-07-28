# Agent Eval System — Implementation Plan (for pi)

**Goal:** Turn the activity-feed dashboard + timeline.db into a system that **measures, tracks, and helps improve** Ben's Claude Code and pi agents.

**Owner harness:** pi agent. Work in the `~/activity-feed` repo (its own remote: `toasterman234/activity-feed`). Commit per phase.

**Core idea:** The data already exists but lives on three disconnected islands. This plan connects them, adds automatic grading, adds trend views, and adds a propose-fixes loop. Do the phases in order; each is independently shippable and verifiable.

---

## Ground truth (verified 2026-07-26)

**timeline.db** (`~/central-ops-dashboard/timeline.db`, SQLite) — the richest outcome source.
- Table `timeline_events`, ~1,467 rows, sources: `claude-code` (1358), `omp` (54), `open-webui` (37), `cursor` (18), `codex` (1).
- Per-session fields already captured: `id, source, operation, status, started_at, ended_at, duration_ms, prompt_count, agent_id, cwd, project, error, summary, thread_id, headline, accomplished_json, open_json, drifted (0/1), dead_end (0/1), phases_json, next_json, evidence_refs_json, judgment_provenance, judged_at, handoff_raw`.
- Coverage gap: 348 rows unjudged; the rest are prose judgments (`authored`/`observed`), **not** structured pass/fail. `drifted` is set on 204 claude-code rows, `dead_end` on only 9 — under-labeled.

**activity-feed dashboard** (Postgres `activity_log` → electric engine → Next.js).
- Tables: `activity_log`, `judgments` (verdict: good/bad/golden/bug/redundant + comment + collection_id), `judgment_collections` (kind: eval/dataset/regression/watchlist), plus threads/channels/repos/perf/finance.
- Feeders ingest both Claude (`claude-transcript-watcher.js`) and pi (`pi-session-watcher.js`, `pi-watcher.js`) transcripts into `activity_log`.
- `/api/run-eval` already exports a collection to JSONL and counts good/golden=pass, bad/bug=fail.
- Manual verdict UI exists on the `/activity` page.

**Evals skill** (`~/.claude/skills/Evals/`) — 11 graders (6 code, 3 model, human), pass@k scoring. Complete but unused ~100 days. Reuse its `LLMRubric` grader design; don't rebuild scoring from scratch.

**Frozen/dead — do not depend on:** agent-introspection project (frozen, needs Zima DAG host), pi orchestration daemon (retired), AgentField (degraded).

---

## Phase 0 — Foundation: session-level outcome model (½ day)

**Why:** Everything downstream needs one row per *agent session* with a structured outcome. Right now outcomes are split between timeline.db and the dashboard's activity-level judgments.

**Tasks**
1. Add a new Postgres table `agent_runs` to `dashboard/src/app/schema.ts` and the migration path (follow how existing tables are declared). Columns:
   - `id` (text, PK — reuse timeline_events.id), `source` (claude-code|pi|codex|cursor|omp|open-webui), `agent_id`, `project`, `cwd`, `operation` (first prompt / task), `started_at`, `ended_at`, `duration_ms`, `prompt_count`, `error`.
   - Outcome fields: `outcome` (enum: success|partial|failed|drifted|dead_end|unknown), `outcome_score` (numeric 0–1, nullable), `outcome_source` (enum: hook|human|auto_judge), `drifted` (bool), `dead_end` (bool), `headline`, `summary`, `judged_at`.
   - `raw_ref` (text — path/thread_id back to timeline.db / transcript for drill-down).
2. Add index on `(source, started_at desc)` and `(outcome)`.

**Acceptance:** table exists, dashboard builds (`cd dashboard && npm run build` or the project's build cmd), no type errors.

---

## Phase 1 — Bridge timeline.db → agent_runs (1 day)

**Why:** Get all 1,467 existing sessions, both Claude and pi, into one queryable outcome table. This alone delivers "measure + track."

**Tasks**
1. Write a feeder `feeders/timeline-to-agentruns.js` (Node, mirror the style of existing feeders) that:
   - Reads `~/central-ops-dashboard/timeline.db` (read-only, `better-sqlite3` or shell out to `sqlite3 -json`).
   - Upserts each `timeline_events` row into Postgres `agent_runs`.
   - Maps outcome: `dead_end=1 → dead_end`; else `drifted=1 → drifted`; else `error not null → failed`; else if `accomplished_json` non-empty → `success`; else `unknown`. Keep it deterministic and documented in a comment.
   - Non-destructive upsert on `id` (never clobber a `human` or `auto_judge` outcome with a `hook` one — precedence: human > auto_judge > hook).
2. Run it once as a backfill; confirm row counts match.
3. Add it to whatever schedules the other feeders (launchd/cron in this repo) to run every few minutes.

**Acceptance:** `SELECT source, outcome, count(*) FROM agent_runs GROUP BY 1,2` returns sensible numbers; re-running the feeder doesn't duplicate or downgrade rows.

---

## Phase 2 — Measure & Track: the agent-runs view (1 day)

**Why:** One screen that answers "how are my agents doing."

**Tasks**
1. New route `dashboard/src/app/runs/` (list) reading `agent_runs`:
   - Filters: source/harness, project, outcome, date range.
   - Columns: when, source, agent, project, operation (truncated), outcome badge, duration, prompt_count, drift/dead-end flags, link to drill-down.
2. New route `dashboard/src/app/runs/metrics/` (or a tab) — the **trends** page:
   - Success rate and drift rate **per week**, overall and split by source/harness and by agent.
   - Simple counts: total runs, % judged, % unjudged, top failing projects, avg duration.
   - Keep charts minimal (the repo already renders perf trends — reuse that pattern).
3. Home page: add a small "Agent health" card (this week's success rate + drift rate vs last week).

**Acceptance:** open both pages in a real browser (Interceptor skill), confirm they load, filters work, numbers reconcile with a manual SQL query. **Do not mark done from code alone** — this is UI (per Ben's rule).

---

## Phase 3 — Automatic grading (auto-judge) (1–2 days)

**Why:** 348 sessions are unjudged and the rest lack structured verdicts. Manual clicking won't scale.

**Tasks**
1. Write `feeders/auto-judge.js` (or a small Python script) that:
   - Selects `agent_runs` where `outcome_source != 'human'` and (`judged_at` null OR older than the session's `ended_at`).
   - For each, loads the session transcript (path via `raw_ref` / cwd + session_id; Claude at `~/.claude/projects/**/*.jsonl`, pi at `~/.pi/agent/sessions/**/*.jsonl`).
   - Calls an **LLM rubric grader** (reuse the Evals skill `LLMRubric` design; model = `gemini-2.5-flash` for cheap grading per Ben's notes, via the commandcode proxy `127.0.0.1:8787/v1` or Zima LiteLLM). Rubric returns JSON: `{outcome, score 0-1, drifted, dead_end, one_line_reason}`.
   - Writes result back to `agent_runs` with `outcome_source='auto_judge'` (respect precedence: never overwrite `human`).
   - Also writes a matching row into the dashboard `judgments` table (good/golden=pass, bad/bug=fail) so the existing collections/run-eval plumbing sees it.
2. Batch it: nightly cron, cap tokens (grade only sessions with >N prompts or non-trivial duration; log what was skipped — no silent truncation).
3. Add a "review disagreements" filter on `/runs`: where auto_judge and hook disagree, surface for Ben to confirm (one click → `outcome_source='human'`).

**Acceptance:** run on 20 sample sessions, spot-check 5 verdicts by hand for sanity, confirm rows land in both `agent_runs` and `judgments`, confirm re-run is idempotent and never overwrites human verdicts.

---

## Phase 4 — Improve loop: propose fixes (1–2 days)

**Why:** This is the "improve" half. Revives agent-introspection's idea without the dead Zima dependency — runs locally as a pi job.

**Tasks**
1. Write a weekly job `feeders/propose-improvements.js` that:
   - Pulls the worst-graded sessions from the last 7 days (failed/drifted/dead_end, grouped by agent and by project).
   - Clusters recurring failure reasons (from `auto_judge` one-line reasons + `error`).
   - Asks an LLM to propose **one concrete, evidence-backed fix per cluster** — e.g. a specific edit to a CLAUDE.md, a skill instruction, or an agent config — with the session IDs as evidence. **Propose only, never auto-edit** (matches the original agent-introspection contract).
   - Writes proposals to a new `improvement_proposals` table + a `/improvements` review page (accept / dismiss / snooze).
2. Accepted proposals: leave the actual edit to Ben/a follow-up session; just record the decision.

**Acceptance:** produces a weekly digest of ≤5 concrete proposals each linked to real session evidence; `/improvements` page renders (browser-check).

---

## Phase 5 — Regression suite (optional, later) (1 day)

**Why:** Catch quality regressions when Ben changes a prompt, model, or config.

**Tasks**
1. Turn `golden` verdicts into a regression collection (the `judgment_collections` kind already exists).
2. Wire the Evals skill's `RunScenario`/`RunEval` to replay those golden cases against a chosen model/prompt and report pass@k, using the existing `/api/run-eval` as the export path.
3. Add a "compare run" view: model A vs model B (or prompt v1 vs v2) side-by-side pass rate.

**Acceptance:** running the suite twice on the same model gives stable pass rates; changing the model changes them.

---

## Execution rules for pi

- **One phase per PR/commit.** Commit only explicit changed paths in `~/activity-feed`. This repo is separate from ben-workspace — its own remote, no safe-commit gate.
- **Anything visual (Phases 2, 4) must be browser-checked** with the Interceptor skill before claiming done. If a backend (electric engine :8795, ds :8791) is down, say so instead of claiming it works.
- **Reuse, don't rebuild:** existing feeders' style, existing `judgments`/`collections` tables, existing `/api/run-eval`, the Evals skill's grader designs.
- **Grading model:** `gemini-2.5-flash` (cheap) via commandcode proxy or Zima LiteLLM; `gemini-2.5-pro` is quota-blocked — do not use.
- **Precedence rule everywhere:** human > auto_judge > hook. Never let a cheaper source overwrite a better one.
- **No silent caps:** if a batch job limits how many sessions it grades, log the skipped count.

## Definition of done (whole system)

Ben can open the dashboard and see: (1) every Claude and pi session with a structured outcome, (2) success/drift trends over time per agent, (3) most sessions auto-graded with only disagreements needing his review, and (4) a weekly list of concrete, evidence-backed fixes to approve.
