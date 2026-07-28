# PLAN — Promote a thread to a formal AIWG project

Status: **shipped** (promote API + GuideBar promote action + `PromoteStatusPanel` live). Design agreed 2026-07-25. Deeper AIWG project-detail UX is tracked separately in `PLAN-project-detail-aiwg.md`.
Depends on the lifecycle/workflow system in `PLAN-lifecycles.md` (a thread's
state machine + workflow steps are the main source material this reads from).
Builds on AIWG (github.com/jmagly/aiwg), tested locally same session:
`aiwg new <name> --no-agents` confirmed to scaffold just docs (no agent bloat) —
see `.aiwg/intake/*`, `CLAUDE.md`, `AIWG.md`, `SECURITY.md`, `WORKSPACE.md`, git init.

## Goal
Give a channel/thread a **"Promote to Project"** action. It takes everything the
thread accumulated — messages, decisions, artifacts, code, workflow-step history —
and turns it into a real, standalone git repo scaffolded with AIWG's SDLC doc
structure (requirements/architecture/security/testing/ci), pre-filled from the
thread's actual content instead of blank templates.

## Decisions (settled 2026-07-25)
1. **New git repo per promotion.** Not a folder bolted onto an existing repo.
   Each promoted thread becomes its own project with its own history.
2. **Fire-and-forget.** Promotion is a one-shot conversion, not an ongoing sync.
   Once promoted, the project lives independently — no live link back to the
   thread's future messages. The **source thread is archived, not deleted**,
   and the project keeps a reference back to it (thread id / permalink) for
   provenance ("this project came from thread X").
3. **Extraction/pre-fill = agent prompt + deterministic parsing, combined.**
   - Deterministic: pull structured data straight out of existing tables —
     `thread_artifacts`, `thread_workflow_steps`, `thread_plans`, any code
     diffs — no LLM needed, these already have shape.
   - Agent prompt: freeform thread content (chat messages, decisions made in
     conversation, problem statement) doesn't have shape, so one agent call
     reads the thread transcript and maps it onto AIWG's template fields
     (intake problem statement, decision log entries, threat-model notes).

## Flow
1. **Trigger** — "Promote to Project" button/action on a thread page
   (`src/app/channels/[channelId]/[threadId]/page.tsx`), likely gated to
   threads in a terminal/accepted lifecycle state (avoid promoting
   half-finished work — exact gating TBD when lifecycles ship).
2. **Collect** (deterministic) — server reads:
   - `thread_artifacts` → candidate files for the new repo, or attachments
     for `.aiwg/` docs (e.g. failing-test output → testing notes)
   - `thread_workflow_steps` → workflow run history → maps to decision/CI log
   - `thread_plans` → maps to `.aiwg/planning/`
   - root message + thread metadata → project name, lifecycle type (coding
     vs research vs planning — informs which AIWG doc sections matter most)
3. **Scaffold** — server runs, in a fresh directory:
   ```
   aiwg new <project-name> --no-agents
   ```
   then copies in the specific template folders needed from the AIWG SDLC
   framework source (not deployed via `aiwg use`, just files):
   - `templates/requirements/`, `templates/architecture/`, `templates/security/`,
     `templates/test/` → into `.aiwg/`
   - `ci/github/workflows/*.yml` (or `ci/gitea/` depending on target host) → `.github/workflows/`
4. **Populate** (agent prompt) — one agent call, given the thread transcript +
   collected artifacts, fills in:
   - `.aiwg/intake/project-intake.md` (problem statement, scope, success metrics)
   - `.aiwg/requirements/` (user stories / use cases, if inferable)
   - `.aiwg/decisions/` (decision log entries, from actual "we decided X"
     moments in the thread)
   - `.aiwg/security/threat-model.md` (only if the thread's lifecycle/workflows
     touched security — otherwise leave templated)
   This is the one non-deterministic step — needs a defined completion
   criterion (e.g. "all REQUIRED template sections filled or explicitly
   marked N/A") so it doesn't silently half-finish.
5. **Init + commit** — `git init` (already done by `aiwg new`), commit the
   scaffold + populated docs as the initial commit. Push to wherever new repos
   go (GitHub? local bare repo? — TBD, matches existing repo-creation flow if
   one exists).
6. **Verify** — before anything destructive, confirm the output is real: the
   git commit exists, the copied CI `.yml` parses, and the REQUIRED-section gate
   (decision 6) passed. If any check fails, treat as a failed promotion (see
   "Failure & edge cases") — do **not** archive the thread.
7. **Link back (last, only on success)** — once the commit is verified, thread
   gets marked `promoted → <repo path/URL>` and **only then** moves to an
   archived state (read-only, not deleted). Project's
   `.aiwg/intake/project-intake.md` or a dedicated field stores the source
   thread id/permalink for provenance. Archiving is the final, irreversible
   step — nothing before this point mutates the source thread.

## Failure & edge cases (added 2026-07-25, review pass)
- **Atomicity / rollback.** Nothing destructive happens until the initial commit
  is verified (step 6). The thread stays live and the scaffold is built in a
  **temp directory**; only after a verified commit does the repo move to its
  destination and the thread get archived. On any failure, delete the temp dir
  and leave the thread untouched so the user can fix and retry.
- **Secrets leakage (two directions).**
  - *Push auth*: pushing to a remote (GitHub) needs a token/credential — define
    where it comes from (existing git creds on the host, or user-supplied at
    promotion time). Never bake it into the repo.
  - *Transcript secrets*: thread messages often contain keys/passwords/paths.
    Run a **scrub/redact pass** on agent-populated docs before commit so secrets
    don't get committed and pushed into `.aiwg/` docs.
- **aiwg version pinning.** The scaffold copies files from aiwg's internal
  folders (`templates/requirements/`, `ci/github/workflows/`, etc.). aiwg ships
  ~daily, so those paths/templates will drift. **Pin a specific aiwg version** on
  the backend; treat upgrading it as a deliberate, tested change, not automatic.
- **Project-name safety.** Name is derived from the root message — sanitize to a
  valid git/dir name and handle collisions (two threads → same name; suffix or
  prompt).
- **Large threads.** A long transcript can exceed the populate agent's context.
  Plan for summarize-then-fill (or chunking) so the most valuable (longest)
  threads don't fail the populate step.
- **Long-running / background job.** Scaffold + agent call + git push is slow for
  a synchronous web click. Run promotion as a **background job with status on the
  thread** (`promoting… / failed at REQUIRED gate / done → repo link`). This also
  gives the REQUIRED-gate stop (decision 6) and other failures a place to surface.
- **Idempotency.** Guard against double-click / re-promotion: if `promotedTo` is
  already set, block or confirm rather than scaffolding a second repo.

## Data model (additions)
- Thread: `promotedTo` (repo path or URL, nullable), `archivedAt`.
- **`thread_promotions` audit row** (committed, not TBD): thread id, repo
  path/URL, timestamp, which agent did the population pass, status
  (`succeeded` / `failed_required_gate` / `errored`). Cheap, and needed for
  traceability + the background-job status surface.

## Decisions (settled 2026-07-25, round 2)
4. **Destination = user-chosen per promotion.** No fixed parent dir or
   auto-push target — the promote action prompts for where the new repo goes
   (local path, or a remote to push to) each time.
5. **Gating = terminal-by-default with override.** Promotion is available once
   a thread is in one of its lifecycle's terminal states (e.g. coding's
   `accepted`, research's `saved`) by default. A "promote anyway" confirm
   allows promoting from a non-terminal state if the user explicitly chooses
   to jump early.
6. **Agent population = required-sections gate.** The populate step must fill
   every section AIWG's own templates mark REQUIRED (e.g. intake's Testing
   Strategy section) or explicitly write `N/A` with a one-line reason. If it
   can't satisfy a REQUIRED section, the pass stops and flags the promotion
   for the user instead of silently committing incomplete docs. No separate
   human-review-before-commit step beyond that gate.

7. **CI template = auto-detected from destination.** Repo pushed to GitHub →
   copy `ci/github/workflows/*.yml`. No separate promotion-time choice; the
   user-chosen destination (decision 4) drives this automatically.

## Open questions to resolve before building
None blocking — core decisions resolved. The "Failure & edge cases" items are
build-time details to nail down (push-auth source, aiwg version to pin, scrub
approach), not open design questions. Next step is a BUILD doc (see
`PLAN-lifecycles-BUILD.md` for the sibling format) once lifecycles themselves
ship, since promotion reads from lifecycle state.

## Explicitly out of scope (per fire-and-forget decision)
- Any live sync back from the project into the original thread.
- Deploying AIWG's 124 agents / commands into the promoted repo — docs +
  CI templates only, matching the earlier `--no-agents` decision.
