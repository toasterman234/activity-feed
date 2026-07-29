# BUILD SPEC — Workflow IA diet + quieter ops chrome (for pi)

**Status:** ready to implement  
**Audience:** pi agent  
**Workdir:** `/Users/bencharney/activity-feed/dashboard`  
**Depends on:** console BUILD (+ FIX). Prefer after stage-loop feels usable, unless Ben wants nav cleanup first.  
**Index:** `PLAN-workflow-next.md`

## Goal

Reduce product confusion so the app feels like a **workflow / agent ops console**, not a grab-bag:

1. Primary bottom nav focused on work  
2. Finance / personal reachable but not peer-equal to Channels while doing agent ops  
3. Quieter step/run labels (less “@pi responding” noise in Home)

## Settled decisions

| Topic | Choice |
|---|---|
| Bottom nav | `Home · Channels · Ops` (3 items). Move **Personal** under Ops or Home secondary link. |
| Finance | Keep routes (`/finance`, etc.) but not bottom-nav primary. Entry: Ops → Finance **or** Home card if already present. |
| Personal | `/personal` remains; link from Ops index or Home. |
| Step labels | Prefer workflow/stage labels over generic `@pi responding` when inserting steps from trigger/advance (best-effort; don’t break trigger). |
| Scope | Nav + copy + Ops index links. No Finance feature deletion. |

---

## ⚠️ CRITICAL GOTCHAS

1. PWA / phone users rely on bottom nav — test narrow width.  
2. Do not break `/personal` or `/finance` URLs (bookmarks).  
3. `layout.tsx` title is already Activity — keep it.  
4. Commit per phase; deploy on Ben’s ask.

---

## PHASE 1 — Bottom nav trim

### File
`src/app/bottom-nav.tsx`

Change tabs to:

```ts
const TABS = [
  { href: "/", label: "Home" },
  { href: "/channels", label: "Channels" },
  { href: "/ops", label: "Ops" },
] as const;
```

### Ops landing
Ensure `src/app/ops/page.tsx` (or layout) has clear links to:

- Personal (`/personal`)  
- Finance (`/finance`)  
- Models / config (`/ops/config` or `/models`)  
- Fleet / runs if those are operator tools  

If Ops page is empty-ish, add a simple link list — no redesign festival.

### Verify
Phone-width: 3 tabs. `/personal` and `/finance` still load via Ops links.

**Commit:** `feat(nav): focus bottom nav on Home Channels Ops`

---

## PHASE 2 — Home “In motion” quieter labels

### Problem
Home shows steps like `@pi responding` / old GuideBar labels that don’t describe stage work.

### Approach
1. When displaying `latestStep.label` on Home, map known noisy labels to friendlier text:

```ts
function displayStepLabel(label: string): string {
  if (/^@\w+ responding$/i.test(label)) return "Agent working";
  if (/guidebar advance/i.test(label)) return "Stage advance"; // legacy rows
  return label;
}
```

2. Optionally prefer lifecycle state label when step is generic.

### Files
`src/app/home/HomeDashboard.tsx` and/or overview API serialization.

### Verify
In motion rows read cleaner; no functional change to data.

**Commit:** `fix(home): quieter in-motion step labels`

---

## PHASE 3 — New step insertion labels (best-effort)

### Files
`src/app/api/channels/trigger/route.ts` — only the string used for `step_label` / workflow step when agent responds (search `@pi responding` or equivalent).

Rename new inserts to something like `Agent run` or `@pi · {stageLabel}` if stage is known — **minimal diff**. Do not refactor trigger flow.

Advance route already uses `Stage advance` after FIX.

### Verify
New @mention creates a non-noisy step label.

**Commit:** `fix(channels): clearer workflow step labels on trigger`

---

## PHASE 4 — QA

- [ ] Bottom nav 3 items on OVH after deploy  
- [ ] Ops → Personal / Finance work  
- [ ] Home labels quieter  
- [ ] Deep links to old URLs work  

Deploy only if Ben asks.

---

## Out of scope

- Removing Finance code  
- Stage loop / agent install  
- Redesigning Home cards wholesale  

---

## Checklist

```
[ ] PHASE 1 — bottom nav + Ops links
[ ]   commit
[ ] PHASE 2 — Home display label mapping
[ ]   commit
[ ] PHASE 3 — trigger step_label cleanup (minimal)
[ ]   commit
[ ] PHASE 4 — QA; deploy if Ben asks
```
