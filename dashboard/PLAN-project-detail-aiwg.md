# PLAN — AIWG-aware Project Detail page

**Status:** design captured — not yet implemented  
**Repo:** `/Users/bencharney/activity-feed/dashboard`  
**Related:** `PLAN-project-promotion.md`, `PLAN-graph-continuity.md`, `PLAN-issues-channel.md`

---

## 0. Goal

Turn **Projects** from a repo registry + launcher into an **AIWG-aware project workspace** that reflects what promotion actually creates.

The page should make three truths visible:

1. A promoted project is a **real git repo** on disk
2. It is scaffolded as an **AIWG SDLC project** (`.aiwg/`, `AIWG.md`, `WORKSPACE.md`, `CLAUDE.md`, CI, git init)
3. Work in the dashboard still happens through **repo-bound thread lanes** (primarily Issues), not in-place editing on `/projects`

This is a visibility / navigation / orchestration surface — **not** an in-browser IDE.

---

## 1. Current state (ground truth)

### What exists today

- `src/app/projects/page.tsx`
  - lists rows from `repos`
  - separates **From promotions** vs **Registered repos**
  - supports only `Work here`, `Open source thread`, `Remote`
- `src/app/api/projects/work/route.ts`
  - reuses or creates an **Issue** thread bound to `repo_id`
- `src/app/api/channels/promote/route.ts`
  - scaffolds with `aiwg new <name> --no-agents`
  - populates files, commits, registers repo, archives source thread

### What a promoted repo actually contains

Current promoted project (`graph-continuity-b-c-d`) on OVH has:

- `.aiwg/`
- `.github/workflows/`
- `AIWG.md`
- `WORKSPACE.md`
- `CLAUDE.md`
- `README.md`
- `SECURITY.md`
- `.git/`

### Gap

The dashboard currently treats this as just:

- a `repos` row
- a filesystem path
- a button that opens an Issues thread

It does **not** expose the AIWG scaffold it generated.

---

## 2. Product position

### What Projects should be

A **project control surface** that answers:

- What is this repo?
- Where did it come from?
- What AIWG scaffold/artifacts exist?
- What work threads are tied to it?
- What is active right now?
- What should I do next?

### What Projects should not be

- A generic repo browser
- A code editor
- A second thread UI that duplicates Channels
- A replacement for AIWG on disk

---

## 3. Information architecture

Add project detail route:

- `src/app/projects/[repoId]/page.tsx`

Project list (`/projects`) becomes a true index. Each card gets **Open project** in addition to **Work here**.

### Project detail sections

#### A. Overview

Show:

- repo name
- absolute path
- remote URL (if any)
- source thread link (if promoted)
- created date
- current active work thread (if any)
- latest promotion status / provenance

Primary actions:

- **Resume work** → open active repo-bound issue thread if present
- **New work thread** → create a new issue thread even if one exists (explicit action, unlike default Work here)
- **Open source thread**
- **Open remote**

#### B. AIWG / SDLC

Read and render:

- `WORKSPACE.md`
- `AIWG.md`
- `CLAUDE.md`
- `.aiwg/intake/*`

Show a simple progress checklist based on file presence / non-empty content:

- Intake started
- Intake completed
- Requirements present
- Architecture present
- Testing notes present
- Security notes present
- CI scaffold present

This is intentionally light in v1: **file presence + excerpt**, not semantic judging.

#### C. Work threads

List all threads where `thread_meta.repo_id = repo.id`, grouped by lifecycle:

- open / active issues
- planning threads
- research threads
- archived promoted source threads

Each row shows:

- title
- lifecycle + current state
- updated time
- channel link

#### D. Thread artifacts

List `thread_artifacts` across repo-bound threads:

- title
- kind
- source thread
- created time

This bridges the dashboard-native artifacts and the disk-native AIWG docs.

#### E. Promotion history

Use `thread_promotions` + promoted source thread:

- source thread title
- status
- created / completed time
- repo path
- any failure detail

Even if there is only one promotion today, model it as history.

---

## 4. Behavior rules

### Rule 1 — Projects is read-first, thread-first

The page shows context and launches work. It does not replace thread execution.

### Rule 2 — AIWG is the canonical project scaffold

If AIWG docs exist on disk, surface them as first-class sections. Do not invent a separate project schema in Postgres for the same concepts.

### Rule 3 — Work lanes stay in Channels

All agent execution continues via repo-bound threads.

- `Resume work` → existing active issue thread
- `New work thread` → explicit creation path

### Rule 4 — Registry repos and promoted repos share one shell

Manual repos can open the same detail page, but AIWG sections may show `Not scaffolded by promotion` / `No AIWG files detected`.

---

## 5. API additions

### A. Project detail aggregate

New route:

- `GET /api/projects/[repoId]`

Returns:

- repo row
- source thread info (if promoted)
- active work thread (latest non-terminal issue thread)
- repo-bound thread list
- repo-bound thread artifacts
- promotion rows
- AIWG file snapshots / existence checks

Server reads:

- Postgres for repo / thread / artifact / promotion metadata
- filesystem for `WORKSPACE.md`, `AIWG.md`, `CLAUDE.md`, `.aiwg/intake/*`

### B. Optional explicit new-thread action

New route:

- `POST /api/projects/work/new`

Same as current work route but **always** creates a fresh issue thread. Keeps default `Work here` idempotent.

---

## 6. UI changes

### `/projects`

Each project card gets:

- **Open project**
- **Work here** (resume/reuse)
- source thread / remote links as today

Card subtitle should stop implying Projects itself is the work surface.

Recommended copy:

> Projects show repo context and AIWG scaffold. Work happens in repo-bound threads.

### `/projects/[repoId]`

Tabs or stacked sections:

1. Overview
2. AIWG
3. Work threads
4. Artifacts
5. History

Phone-first default: stacked accordions. Desktop can use tabs.

---

## 7. Data model impact

No new core tables required for v1.

Use what already exists:

- `repos`
- `thread_meta`
- `messages`
- `thread_artifacts`
- `thread_promotions`

Optional later:

- `repo_views` / cached summaries if filesystem reads become slow
- explicit `repo_thread_kind` if grouping needs more structure

---

## 8. Acceptance

### A. Promoted AIWG project

For `graph-continuity-b-c-d`, `/projects/<repoId>` shows:

- repo path
- source thread link
- active work thread link
- AIWG file sections with content from `WORKSPACE.md`, `AIWG.md`, `CLAUDE.md`
- promotion provenance

### B. Manual repo

For a manually registered repo with no AIWG scaffold:

- overview still works
- AIWG section clearly says scaffold not present
- work threads still work

### C. Work routing

- `Work here` still reuses the active issue thread
- `Open project` never creates a thread
- optional `New work thread` creates a second issue thread only when explicitly chosen

### D. Phone UX

- project detail is readable on mobile
- primary actions visible without horizontal scroll

---

## 9. Implementation order

1. `GET /api/projects/[repoId]` aggregate route
2. `/projects/[repoId]` detail page
3. Add **Open project** to project cards
4. Add optional **New work thread** action
5. Polish copy + empty states

---

## 10. Why this aligns with AIWG

This plan does **not** fight the scaffold.

It treats AIWG as the source of truth for project structure and uses the dashboard to:

- surface AIWG context
- route humans into the correct work thread
- show provenance and history
- unify disk artifacts and channel artifacts

That is the right boundary.

The wrong boundary would be building a generic repo page that ignores `.aiwg/`, `WORKSPACE.md`, and `AIWG.md`.
