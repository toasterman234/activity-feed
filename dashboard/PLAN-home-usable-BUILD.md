# BUILD SPEC — Home usable (Needs you → real work, not metadata theater)

**Status:** ready to implement  
**Audience:** pi agent  
**Workdir:** `/Users/bencharney/activity-feed/dashboard`  
**Depends on:** none (can ship independently of coding stage-loop polish)  
**Index:** update `PLAN-workflow-next.md` when this lands  
**Live symptom (2026-07-29):** Home **Needs you** shows `Work: activity-feed` / `Work: graph-continuity-b-c-d` as `issue_needs_triage` with `assignee: null`, `repo: null`. Opening the thread shows **Capture**, **Do this now**, and **Issue setup / Missing: owner, repo** — even when Ben believes the work is already scoped. Feels like a form gate, not a work surface.

---

## Goal

Make Home → thread feel **usable for a solo operator**:

1. **Needs you** surfaces *real* human decisions (review, blocked, failed gates) — not “fill owner/repo.”
2. Open issues auto-heal common metadata (default owner; infer repo from title like `Work: activity-feed`).
3. Thread chrome for metadata is quiet: no amber Do-now theater when the only gap is owner/repo (or after auto-fill).
4. Opening an issue lands on **what to do next**, not a setup form.

This is a **UX / product friction** BUILD, not a visual redesign festival. Prefer small, surgical changes.

---

## Settled decisions (Ben)

| Topic | Choice |
|---|---|
| Default owner | Prefer viewer identity already used on Home: **`you`**. If assignee empty on open issue, treat / persist as `you`. Do **not** invent a second identity system. |
| Repo inference | From thread title when it matches `Work: <name>` / `Work - <name>` / trailing path-ish name; match against `/api/repos` (or DB `repos`) by **name** (case-insensitive) or path basename. If no match → leave null; **do not** invent repos. |
| Needs you ranking | **Demote** metadata-only triage. Prefer: failed gates → review/blocked → then (optional, low priority or hidden) unscoped issues. Default: **exclude** `issue_needs_triage` from `topNeedsMe` once auto-heal exists; keep a quieter “Unscoped issues” bucket only if useful. |
| Capture label | Keep lifecycle state `open` internally. **UI label** on thread for solo use: show purpose-forward copy (“Describe the problem…”) not a scary empty **Capture** hero if that fights usability — optional Phase 3. Do **not** rename DB state keys. |
| Do this now | Show DoNowBanner for triage **only** when auto-heal could not set owner **and** repo is still required for advance *or* Ben explicitly opened `?need=triage`. After owner defaults to `you`, **do not** banner solely for missing repo if Home no longer lists it as Needs you. |
| Repo still useful? | Yes for agent runs / coding handoff. **Not** a blocker to *look at* or triage an issue. Soft-prompt in Issue setup; hard-require only when starting agent/coding handoff (if already gated elsewhere, reuse that — don’t add new walls). |
| Scope | Home overview API + attentionGuide + Issue setup / DoNow chrome. No Finance redesign. No full visual theme pass. |

---

## ⚠️ CRITICAL GOTCHAS

1. **Home viewer is hard-coded `"you"`** in `src/app/api/home/overview/route.ts` (`const viewer = "you"`). Default assignee must stay consistent with that string unless you intentionally change both.
2. **SQL already selects unscoped issues** into Needs you:
   - `tm.lifecycle = 'issue' AND tm.state = 'open' AND (tm.repo_id IS NULL OR COALESCE(tm.assignee, '') = '')`
   - Changing only UI copy without changing this query will leave Home noisy.
3. **`deriveThreadAttention`** in `attentionGuide.ts` drives DoNow + copy — keep Home API and thread page consistent (same helper).
4. **Do not break** `?need=triage` deep links from Home cards that still exist.
5. **Auto-write to `thread_meta`** (persisting default owner / inferred repo) must use existing write path (`writeChannelRow("thread_meta", …)` or server-side UPDATE in overview/heal endpoint). Prefer **one small heal API** or heal-on-GET for the thread page — avoid silent writes from Home list for every poll (Home polls).
6. **Shape budget / Electric:** `thread_meta` is already a live shape — writes are fine; don’t add new shapes.
7. Phone / PWA: Issue setup edit affordance must remain tappable; don’t hide owner/repo with no way to fix a wrong inference.
8. Commit per phase; deploy on Ben’s ask (`scripts/deploy-ovh.sh`). If `tokens.css` is a symlink to missing `open-design`, materialize the file before clean deploy (known OVH gotcha).

---

## PHASE 0 — Audit (read-only, short)

Confirm on live or local:

1. `GET /api/home/overview` → `topNeedsMe` reasons (`issue_needs_triage` vs `review` / `blocked` / `failed_required_gate`).
2. For one noisy thread: `assignee`, `repo_id`, title, lifecycle/state.
3. Files to touch (expected):
   - `src/app/api/home/overview/route.ts`
   - `src/app/channels/attentionGuide.ts`
   - `src/app/channels/DoNowBanner.tsx` (maybe only callers)
   - `src/app/channels/[channelId]/[threadId]/page.tsx` (Issue setup / DoNow / `forceEdit`)
   - `src/app/home/HomeDashboard.tsx` (optional quieter section)
   - New small helper: e.g. `src/app/channels/issueMetaHeal.ts` (infer + defaults)

Write 5–10 lines into this plan under **Findings** if anything surprises you, then proceed.

**Commit:** none (or `docs: note home-usable audit findings` only if you edit this file).

---

## PHASE 1 — Stop treating missing metadata as primary “Needs you”

### Problem
Unscoped open issues compete with real approvals/blocks on Home.

### Change (`overview/route.ts`)

1. **Remove** (or gate behind a flag defaulting off) the SQL branch that adds open issues with null assignee/repo into the main approvals / `topNeedsMe` list.
2. Keep in `topNeedsMe` / `needsAttention.approvalThreads`:
   - `failed_required_gate`
   - `state IN ('review', 'blocked')`
   - `lifecycle = 'issue' AND state = 'resolved'` (verify/approve fix)
3. Optional: add `needsAttention.unscopedIssues` (slice 0–5) **separate** from Needs you primary list — Home may show a quiet secondary line (“3 issues missing repo”) linking to Issues channel, **not** amber Do-now cards.
4. Update `summaryCounts.needsMe` so it **does not** count metadata-only triage.
5. Fix fallback copy in `explainApproval` / `issue_needs_triage` branch so it isn’t the default path for empty lists.

### Home UI (`HomeDashboard.tsx`)

1. Primary **Needs you** list = real attention only.
2. If you add `unscopedIssues`, render as muted secondary — no “Do this now” language.

### Verify
- Overview JSON: noisy `Work: …` threads gone from `topNeedsMe` (unless they are actually in review/blocked).
- Failed gate / review threads still appear.
- `needsMe` count drops accordingly.

**Commit:** `fix(home): demote unscoped issues out of Needs you`

---

## PHASE 2 — Default owner + infer repo (heal on thread open)

### Problem
Ben opens a thread and is forced to type owner/repo he already “meant.”

### New helper `src/app/channels/issueMetaHeal.ts`

Pure functions + one async apply:

```ts
export const DEFAULT_ISSUE_OWNER = "you";

export function inferRepoHintFromTitle(title: string): string | null
// "Work: activity-feed" → "activity-feed"
// "Work - graph-continuity" → "graph-continuity"
// strip noise; return null if no hint

export function matchRepo(
  hint: string,
  repos: Array<{ id: string; name: string; path?: string | null }>,
): { id: string; name: string } | null
// case-insensitive name match, then path basename match

export type HealPatch = { assignee?: string; repo_id?: string };

export function proposeIssueMetaHeal(input: {
  lifecycle: string;
  state: string;
  title: string;
  assignee: string | null;
  repoId: string | null;
  repos: Array<{ id: string; name: string; path?: string | null }>;
}): HealPatch | null
// Only for lifecycle === "issue" && state === "open" (and maybe triaged).
// If !assignee?.trim() → assignee = DEFAULT_ISSUE_OWNER
// If !repoId && hint → matchRepo
// Return null if nothing to change
```

### Apply heal (pick one; prefer A)

**A (recommended):** On thread page load, when meta is issue/open and patch non-null, `writeChannelRow("thread_meta", { …existing, …patch, updated_at })` once per mount (guard with ref so Strict Mode doesn’t double-write badly; idempotent values OK).

**B:** `POST /api/channels/issue-meta-heal` with `{ threadId }` server-side UPDATE + repo match via DB — better if you want Home to heal without opening the thread (optional later).

### Issue setup UI

1. After heal, missing amber border should clear for owner.
2. If repo still missing: soft line — “Link a repo when you’re ready to run agents” — **not** DoNowBanner.
3. Prefill owner input with `you` when empty (even before save).
4. Stop `forceEdit={true}` solely because `need === "triage"` when owner is already set / defaulted.

### `attentionGuide.ts`

Update open-issue branch:

- If assignee missing → still can suggest default, but **need: "triage"** only when you still want a banner (prefer: **no triage need** if assignee will default to `you`; missing repo alone → `need: null` or a soft non-banner hint).
- CTA copy: “Assign owner / repo” → “Link repo” only when that’s the remaining gap and you choose to show a weak affordance (not DoNow).

### Verify
- Open `Work: activity-feed` with null meta → after load, assignee `you`; repo linked if `activity-feed` exists in repos.
- Reload: no repeated noisy writes (same values).
- DoNowBanner **not** shown for owner-only gap.
- Manual edit of owner/repo still works.

**Commit:** `feat(issues): default owner and infer repo from Work: titles`

---

## PHASE 3 — Quieter thread chrome (Capture / Do now)

### Problem
Even with meta fixed, first viewport still feels like onboarding.

### Changes

1. **DoNowBanner:** only mount when `attention.need` is `review` | `blocked` | `gate` | `verify`, or triage **with** a remaining hard gap you intentionally kept. Not for soft repo prompts.
2. **Issue setup card:** collapse by default when owner is set (show one-line summary `@you · activity-feed`); expand on “Edit owner / repo.”
3. **Stage label `Capture`:** in `ThreadStageStack` / stage chip for `issue`+`open`, prefer purpose or “Open” as display if Capture confuses — **optional**, keep state key `open`.
4. Home card `nextStep` strings: remove “follow Do this now” for paths you demoted.

### Verify
- Opening a healed issue: no amber Do-now; stage stack + conversation/work visible without scrolling past a form wall.
- Review/blocked still get a strong banner.

**Commit:** `fix(ux): quiet issue setup and Do-now for metadata`

---

## PHASE 4 — QA checklist (pi + browser)

Use Interceptor VerifyDeploy-style checks on OVH after deploy (Ben’s ask):

| # | Check | Pass |
|---|---|---|
| 1 | Home Needs you excludes unscoped-only issues | |
| 2 | Real review/blocked/gate still listed | |
| 3 | Open `Work: activity-feed` → owner becomes `you` (persisted) | |
| 4 | Repo inferred when name matches | |
| 5 | No DoNow for metadata-only | |
| 6 | Can still manually change owner/repo | |
| 7 | Coding threads untouched (no issue heal side effects) | |
| 8 | `?need=triage` doesn’t break; at worst opens edit once | |

Screenshots under `dashboard/tmp-qa/` optional.

---

## Out of scope

- Full Home visual redesign / new design system  
- Renaming issue lifecycle states in DB  
- Auto-creating repos  
- Multi-user assignee directories  
- Finance / Personal IA  
- Merging Stage Action Bar with Issue setup  
- Forcing triage→in_progress automatically  

---

## Checklist for pi

- [ ] Phase 0 audit notes (if needed)
- [ ] Phase 1 Home demote + count fix
- [ ] Phase 2 heal helper + persist + attentionGuide
- [ ] Phase 3 quieter chrome
- [ ] Phase 4 QA
- [ ] Update `PLAN-workflow-next.md` status row for this track → ✅ when deployed
- [ ] Deploy only when Ben asks

---

## Ideal end state

Ben opens Home, **Needs you** means “decide / unblock / verify,” not “fill a form.”  
Opening an issue already named `Work: activity-feed` feels like continuing that work — owner and repo are filled when obvious — and the first screen is the stage / thread, not Capture + Missing owner.
