# Issue Resolution Pipeline

## Goal

Turn the existing Activity Dashboard issue/workflow foundation into a durable, traceable issue → agent work → verification → resolution → regression-feedback pipeline without introducing a second tracker.

## Current phase

Safe control-plane pipeline deployed; autonomous code-worker transport remains intentionally deferred.

## Slices

### Slice 1: Durable work-run contract
- Add an additive `work_runs` schema with stable issue, stage, agent, config, repo, attempt, lease, heartbeat, trace, and result fields.
- Add typed server helpers and focused contract tests.
- Add an idempotent migration and rollback notes.
- **Status:** complete

### Slice 2: Instrument channel agent execution
- Record every channel/issue agent attempt in `work_runs`.
- Preserve existing thread activity UX while making run identity joinable.
- Mark success, failure, interruption, and structured errors.
- **Status:** complete

### Slice 3: Recovery and operator API
- Add stale-run reaping, retry/cancel semantics, and a read API.
- Surface current/recent attempts in the thread Work view.
- **Status:** complete

### Slice 4: Repository verification profiles
- Extend repo records with per-host paths and versioned check profiles.
- Replace lifecycle-global verification commands with repo-specific checks.
- Record verification results as issue evidence.
- **Status:** complete

### Slice 5: Resolution feedback
- Feed failed repository checks into the next bounded work-run attempt.
- Preserve issue, work run, stable agent/config version, check output, and feedback-cycle identity.
- Leave longer-term eval-case promotion to a separate reviewed registry feature.
- **Status:** complete for issue-resolution feedback; eval promotion deferred

### Slice 6: Production hardening
- Apply migrations, build, deploy, run live contract checks, and document rollback.
- Repair deployment/source traceability for the touched scope.
- **Status:** complete for the deployed control plane

## Decisions

| Decision | Reason |
|---|---|
| Existing thread ID remains the issue/work-item ID | Avoids a parallel tracker and preserves all existing messages, plans, artifacts, and URLs. |
| `work_runs` is additive rather than overloading `thread_workflow_steps` | Steps are presentation-level and currently lack identity, leases, attempts, agent versions, and repo revisions. |
| OVH remains the control plane | Workers can later execute near Mac/OVH repo locations without moving tracker authority. |
| Feature behavior lands incrementally | The repo is heavily dirty from other active agents; each slice must remain independently verifiable. |
| Do not turn the OVH web checkout into a coding worker | The live routing index says coding stays in a local harness, AgentField is degraded, and OVH has rsynced non-git source rather than a clean executor checkout. |

## Errors

| Attempt | Error | Resolution |
|---|---|---|
| 1 | Node's type-stripping test runner could not resolve the extensionless TypeScript import in `work-runs.ts` | Use explicit `.ts` imports for directly executed TypeScript tests and enable TypeScript's no-emit import-extension support. |
| 1 | Repo-wide typecheck reports numerous pre-existing errors from other active dashboard work | Track the baseline separately; require no new errors from touched files plus production build as the release gate. |
| 1 | Stable-identity test was invoked from the repository root with a dashboard-relative path omitted | Re-run with the correct `dashboard/` path; no code change needed. |
| 1 | First trigger instrumentation patch did not match because another active agent changed the shared route after inspection | Re-read the current route and apply smaller, context-local patches while preserving their work. |
| 1 | Local production build was refused because another Next build is active | Do not terminate the other agent's build; wait for it to finish, then run the release build once. |
| 2 | A server-side Pi worktree executor would run against OVH's non-git production checkout and contradict current fleet routing | Excluded the unfinished executor slice from production. Keep durable queue/verification contracts live and add a callable local coding-worker transport before enabling autonomous repository mutation. |
