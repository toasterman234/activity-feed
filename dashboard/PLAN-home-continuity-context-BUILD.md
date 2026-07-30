# BUILD SPEC — Home / Continuity origin context (Ready to promote & Needs you)

**Status:** ❌ CANCELLED (2026-07-29)  
**Reason:** Graph Continuity / ActiveGraph soft-off + Tududi cutover. Home no longer surfaces Ready-to-promote / Continuity attention. Do not implement this spec.  
**Superseded by:** `PLAN-proto-ui.md` (Post-teardown IA lock) + `PLAN-workflow-next.md`  
**Audience:** pi agent (historical only)  
**Workdir:** `/Users/bencharney/activity-feed/dashboard`  
**Depends on:** `PLAN-home-usable-BUILD.md` (may already be shipped)  
**Index:** `PLAN-workflow-next.md`  
**~~Live symptom (2026-07-29):~~ Obsolete — Continuity UI stubbed/retired; `useContinuitySnapshot` returns null; graph-inbox returns `{retired:true}`. Original symptom for archival: On Home, **Ready to promote** / Continuity attention rows showed a title + Continuity promote copy without clear origin (graph initiatives often had null channel/thread).

---

## Goal

When Ben sees something on Home that “needs” him or is “ready to promote,” the card and the destination page must answer in one glance:

1. **What system** produced this? (Evidence / Continuity initiative vs channel thread vs inbox decision)  
2. **Where is the source of truth?** (plan path, evidence map id, channel, thread)  
3. **What does the link open?** (initiative detail vs inbox vs channel thread)  
4. **What does the action mean?** (e.g. promote = mark this initiative shipped in the graph after evidence checks pass — not “promote a git repo”)

This is **context UX**, not a Continuity redesign.

---

## Settled decisions

| Topic | Choice |
|---|---|
| Primary fix surface | Home `AttentionList` cards **and** Continuity initiative detail header (“Origin” strip) |
| Data already available | `GraphInitiative`: `title`, `status`, `plan_path`, `evidence_map_id`, `channel_id`, `thread_id`, `created_by`, timestamps. Detail API already returns `links` + `plan` excerpt — Home just doesn’t use most of it. |
| Channel/thread often null | **Expected** for evidence-synced initiatives. Never invent channel links. Show map id + plan path as origin instead. |
| Copy: “Promote” | Clarify as **“Mark shipped (evidence)”** or subtitle “Graph initiative · checks green” so it isn’t confused with thread “Promote to project.” |
| Ready-to-promote placement | Keep under Needs you **or** as a sibling subsection, but add a one-line explainer: “Evidence initiatives whose checks pass but status isn’t shipped.” |
| Inbox rows | Prefer deep links into inbox **with hash/query** if the inbox page supports focusing an id; else show channel name + kind + short id. Don’t leave title-only orphan cards. |
| Scope | Home dashboard + continuity `[id]` page (+ tiny inbox link improvement if cheap). No evidence-engine rewrite. No new Electric shapes. |

---

## ⚠️ CRITICAL GOTCHAS

1. Home loads continuity via `useContinuitySnapshot` → `GET /api/ops/evidence` + `GET /api/channels/graph-inbox`. Initiative list fields are already on each initiative object — extend the typed parse in `HomeDashboard.tsx` (`channel_id`, `thread_id`, `evidence_map_id`, `plan_path`).
2. Resolving **channel names** for non-null `channel_id` may need a join or a small map from Home overview `channels[]`. Don’t N+1 fetch per card. Options: (a) show raw channel id truncated, (b) pass names from overview channels list, (c) enrich `/api/ops/evidence` initiatives with `channel_name` once in the API. Prefer **(c)** if easy in `listInitiatives` / evidence route; else **(b)**.
3. `plan_path` may be repo-relative (`docs/...`, `PLAN-....md`) — display basename + muted full path; don’t claim a working “open file” link unless a known docs viewer exists. Optional: link to GitHub/raw only if already patterned in-app — otherwise plain text path is fine.
4. Continuity detail is at `/channels/continuity/[id]` and already has `links.threadHref` / `channelHref` / `planPath` — surface them in the **first viewport**, not buried.
5. Thread “Promote to project” (`/api/channels/promote`) ≠ initiative promote (`/api/ops/initiatives/[id]/promote`). Keep wording distinct.
6. Phone: origin lines must wrap/truncate; don’t explode card height (max ~3 short lines under title).
7. Commit per phase; deploy on Ben’s ask.

---

## PHASE 0 — Audit (read-only)

1. Call `GET /api/ops/evidence` — sample 5 non-shipped initiatives: which have `plan_path` / `evidence_map_id` / channel / thread?  
2. Open one Ready-to-promote card on Home → continuity detail — note what the first screen fails to explain.  
3. Skim `AttentionList` + `useContinuitySnapshot` initiative typing in `HomeDashboard.tsx`.  
4. Skim continuity `[id]/page.tsx` for where links/plan are rendered today.

Add a short **Findings** bullet list to this file if surprises appear.

**Commit:** none required.

---

## PHASE 1 — Enrich Home attention row model

### File
`src/app/home/HomeDashboard.tsx`

### Extend `AttentionRow`

Add optional fields (names flexible, keep consistent):

```ts
originKind?: "evidence-initiative" | "channel-thread" | "graph-inbox";
originLine?: string;       // one line: "Evidence map · agent-eval · PLAN-…"
sourceHref?: string | null; // secondary deep link (thread or plan) if useful later
mapId?: string | null;
planPath?: string | null;
```

### When building initiative rows (`readyRows` / `attentionRows` / `inMotionInitiatives`)

For each initiative:

1. `originKind: "evidence-initiative"`  
2. `originLine` built as:
   - Always include: `Evidence initiative`
   - If `evidence_map_id`: ` · map {id}`
   - If `plan_path`: ` · {basename(plan_path)}`
   - If channel+thread: ` · thread` (and prefer channel name when available)
   - If only channel: ` · # {channelName|id}`
3. `meta` / `why` / `nextStep` for **ready**:
   - `why`: “Checks pass; graph status is still {status} (not shipped).”  
   - `nextStep`: “Open initiative → review plan/evidence → Mark shipped.”  
   - Avoid vague “Open Continuity → Promote to shipped” as the only clue.
4. Badge for ready: prefer `ready` or `ship` — consider label text **“ready”** with title tooltip “Mark shipped when you’re satisfied.”

### When building channel / failed-promotion rows

Keep `originKind: "channel-thread"`.  
`originLine`: `# {channelName}` + state/reason. Already mostly OK — ensure title isn’t the only signal.

### When building inbox rows

`originKind: "graph-inbox"`.  
`originLine`: `Inbox · {Decision|Proposal|Memory}` + channel name if present + short created age (already have age).  
If inbox UI supports `?id=` / `#id`, append it to href.

### `AttentionList` render

Replace the generic `Continuity · {why}` first line with:

1. **Origin line** (muted): `row.originLine || fallback from source`  
2. **Why** (muted): `row.why` (don’t duplicate origin)  
3. **Next** (emphasized): `row.nextStep`

For Ready to promote subsection header, add explainer under the uppercase label:

> Evidence initiatives with green checks that aren’t marked shipped yet.

### Verify
- Home cards for initiatives show map id and/or plan basename.  
- No card says only “Continuity” with no origin.  
- Channel needs-me rows still show `# channel`.

**Commit:** `fix(home): show origin context on Needs you and Ready to promote`

---

## PHASE 2 — Continuity detail “Origin” strip

### File
`src/app/channels/continuity/[id]/page.tsx`  
(optionally enrich `GET /api/ops/initiatives/[id]` if names missing)

### First viewport (above the fold)

Add a compact **Origin** block:

| Field | Source |
|---|---|
| Kind | “Evidence / graph initiative” |
| Evidence map | `evidence_map_id` (mono) |
| Plan | `plan.path` or `plan_path` — exists badge if `plan.exists` |
| Channel | `links.channelHref` if present |
| Thread | `links.threadHref` if present — label “Source thread” |
| Created | `created_by` · relative `created_at` |

If channel/thread both null, show explicit:

> Not tied to a channel thread — tracked from the evidence map / plan.

### Promote CTA copy

If the page has “Promote” / ship actions, pair with helper text:

> Marks this initiative **shipped** in Continuity after evidence checks pass. This is not thread “Promote to project.”

### Plan excerpt

If `plan.excerpt` exists, show 3–5 lines under Origin so Ben sees *what* the initiative is about without leaving the page.

### Verify
- Opening from Home Ready-to-promote: origin strip visible without scroll on phone.  
- Thread/channel links work when present.  
- Null channel/thread explained, not blank.

**Commit:** `fix(continuity): origin strip and clearer ship copy on initiative detail`

---

## PHASE 3 — API enrichment (only if Phase 1 needed names)

### File
`src/app/api/ops/evidence/route.ts` and/or `listInitiatives` consumers

Join or secondary query: `channel_id → channels.name` as `channel_name` on each initiative JSON.

Skip this phase if Phase 1 is good enough with map id + plan path.

**Commit:** `feat(evidence): include channel_name on initiatives` (if done)

---

## PHASE 4 — QA

| # | Check | Pass |
|---|---|---|
| 1 | Ready-to-promote card shows map and/or plan basename | ✅ YES |
| 2 | Explainer under "Ready to promote" present | ✅ YES |
| 3 | Click-through shows Origin strip with same identifiers | ✅ YES |
| 4 | Initiative with null channel shows "not tied to a thread" | ✅ YES |
| 5 | Channel Needs you rows still show `# channel` + why | ✅ YES |
| 6 | Ship/promote wording ≠ thread promote-to-project | ✅ YES |
| 7 | No layout blow-up on narrow width | ✅ YES |

Browser: Interceptor on Home + one continuity detail. Screenshots optional under `tmp-qa/`.

---

## Out of scope

- Re-binding all evidence initiatives to channels/threads  
- Redesigning Continuity index  
- Changing evidence check logic or promote gate rules  
- Full Home visual redesign  
- Auto-opening plan files in an editor  

---

## Checklist for pi

- [x] Phase 0 audit notes (if needed)
- [x] Phase 1 Home origin lines + Ready-to-promote explainer
- [x] Phase 2 Continuity detail Origin strip + copy
- [ ] Phase 3 only if channel names needed
- [x] Phase 4 QA
- [ ] Update `PLAN-workflow-next.md` status for this track
- [ ] Deploy only when Ben asks

---

## Ideal end state

Ben looks at Home → **Ready to promote** and can tell: “This is evidence initiative **X**, from plan **Y** / map **Z**.”  
He opens it and immediately sees the same origin, a plan snippet, and that **Mark shipped** is a Continuity graph action—not a mystery link and not a repo promote.
