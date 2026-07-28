# Plan: Annotate/Judge Agent Sessions → Evals, Datasets, Regressions

**Status:** shipped (core) — `judgments` / `judgment_collections`, Activity judge UI, `/collections`, `/api/run-eval`. Broader agent-run measure/improve loop continues in `../AGENT-EVAL-PLAN.md` (Phases 3–5 still open).

App: `activity-feed/dashboard` (Next.js PWA, Electric SQL sync, schema at `src/app/schema.ts`).
Goal: let Ben select any moment in the activity/agent-session feed, judge it, comment on it, and save it into a named collection that can later be run/exported as an eval, dataset, or regression test.

## 1. Schema additions (src/app/schema.ts)

Add two tables, synced via Electric like everything else here:

```ts
judgments: {
  columns: {
    id: { type: "text" },          // uuid
    activity_id: { type: "int" },  // FK -> activity_log.id (or session/span ref)
    span_start: { type: "text" },  // optional: sub-selection within a session (tool call id, turn idx)
    span_end: { type: "text" },
    verdict: { type: "text" },     // "good" | "bad" | "golden" | "bug" | "redundant"
    comment: { type: "text" },
    bucket_id: { type: "text" },   // FK -> collections.id
    created_at: { type: "text" },
  },
  primaryKey: "id",
},
collections: {
  columns: {
    id: { type: "text" },
    name: { type: "text" },
    kind: { type: "text" },        // "eval" | "dataset" | "regression" | "watchlist"
    description: { type: "text" },
    created_at: { type: "text" },
  },
  primaryKey: "id",
},
```

Feeder/backend: add matching Postgres tables + migration in whatever feeds `activity_log` today (check `feeders/`), so Electric picks them up automatically — no new sync code needed.

## 2. UI: selection + judge toolbar (src/app/page.tsx)

- On each activity/session row (and inside an expanded session detail view, per tool-call/turn if that granularity exists), add a small hover toolbar: 👍 👎 ⭐ 🐛 ✂️ + a "comment" icon.
- Clicking a verdict opens a lightweight inline popover: comment textbox (optional) + bucket picker (existing collections dropdown + "new collection" inline create).
- Save = one write to `judgments` (+ `collections` if new). Electric handles sync/optimistic UI — no separate API call needed beyond the local write.
- Multi-select: allow shift-click or a "select mode" toggle to tag multiple rows at once into the same bucket in one action.

## 3. New page: Collections (src/app/collections/page.tsx)

- List all `collections`, each showing: name, kind, count of judgments, last updated.
- Click into a collection → list of its judgments with the linked activity summary, verdict, comment.
- Per-collection actions:
  - **Export JSONL** — client-side generates `{input, verdict, comment, activity_ref}` per row, downloads as `.jsonl`.
  - **Run** (only for kind=eval/regression) — calls a small API route (`src/app/api/run-eval/route.ts`) that shells out to or calls the existing Evals tooling (Claude Code `Evals` skill / ax optimizer), passing the exported JSONL. Show pass/fail summary inline.

## 4. Filters to make selection fast

- Add search/filter bar to the main feed (by source, tool used, keyword, date range) so Ben can narrow to relevant sessions before bulk-tagging.
- "Select all filtered" → bulk add to a bucket.

## 5. Export/integration format

Each exported row:
```json
{
  "id": "...",
  "input": "<prompt/context that produced this activity>",
  "output": "<what the agent did/said>",
  "verdict": "good|bad|golden|bug|redundant",
  "comment": "...",
  "source_activity_id": 123,
  "bucket": "regression-suite-1"
}
```
This shape plugs directly into the Claude Code `Evals` skill's dataset format and can seed `ax` GEPA optimizer examples later.

## 6. Build order (small, shippable steps)

1. Schema + migration for `judgments` and `collections`.
2. Judge toolbar on feed rows (no bucket picker yet — just save to a default "inbox" bucket).
3. Collections list page + detail view.
4. Bucket picker / create-new-bucket in the judge popover.
5. Export JSONL button.
6. Filters on main feed for fast multi-select tagging.
7. "Run eval" API route wired to existing Evals tooling.

Steps 1–5 are pure CRUD + UI, no new infra — should be fast for pi to implement incrementally and verify each step in the browser before moving on.
