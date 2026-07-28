# OVH deployment and Pi execution hardening

## Goal

Make dashboard production deployments rollback-safe and verify Pi execution prerequisites end-to-end without disturbing the currently healthy OVH release.

## Current phase

Complete.

## Phases

### Phase 1 — Source alignment and safety invariants

- [x] Compare recovered OVH production source with the Mac working tree.
- [x] Pull back only the incident-recovered files after verifying newer Pi wiring is preserved.
- [x] Define the release and rollback invariants.
- **Status:** completed

### Phase 2 — Pi execution doctor and registry repair

- [x] Add a non-mutating doctor for Pi binary/provider/auth, repo Git roots, and worktree prerequisites.
- [x] Correct the VPS Pi provider configuration.
- [x] Correct invalid repository registrations without guessing paths.
- [x] Run the doctor on OVH.
- **Status:** completed

### Phase 3 — Atomic OVH releases

- [x] Replace in-place `rsync --delete` deployment with versioned release staging.
- [x] Build before activation and retain the previous release.
- [x] Add deployment locking, manifest metadata, health checks, and automatic rollback.
- [x] Add an explicit rollback command.
- **Status:** completed

### Phase 4 — Service crash-loop guard

- [x] Point systemd at the atomic `current` release.
- [x] Add a production-build preflight and bounded restart policy.
- [x] Install and verify the unit safely.
- **Status:** completed

### Phase 5 — Documentation, tests, deployment, and proof

- [x] Add an ADR and update operator documentation.
- [x] Test scripts without activating a release.
- [x] Deploy through the new path.
- [x] Verify Pi smoke, repository/worktree readiness, systemd stability, local HTTP, and external HTTPS.
- [x] Commit only explicit task paths.
- **Status:** completed

## Decisions made

| Decision | Rationale |
|---|---|
| Preserve the healthy current production release while staging changes | A prevention change must not recreate the outage it addresses. |
| Use versioned releases with atomic activation and rollback | A failed or older candidate must never delete the currently runnable build. |
| Treat Git-root validation as a hard Pi execution prerequisite | `prepareRunWorktree()` intentionally refuses non-root paths. |
| Rehydrate Mac files only from verified recovered OVH source | The Mac tree caused the rollback and is not assumed authoritative. |

## Errors

| Attempt | Error | Resolution |
|---|---|---|
| 1 | Saved Pi provider `command-code` is rejected by Pi; dashboard uses `commandcode` successfully | Correct the saved config and test the exact route arguments. |
| 1 | `activity-feed` registry path is not a Git root; `ax-brain-crew` points to the same wrong path | Discover valid roots before updating registry rows. |
| 2 | OVH Git bootstrap requested root `README.md`, but that path does not exist in `origin/main` | Resume using only upstream paths verified with `git ls-tree`; no source files were overwritten. |
| 3 | Local Next/Webpack build became idle for more than two minutes after Serwist bundling | Stopped the idle process; validate the identical Linux production build through the atomic candidate path. |
| 4 | Negative deploy test used zsh's read-only `status` parameter | Rerun with a task-specific variable name. |
| 5 | Focused local test command ran from the repo root but used dashboard-relative script paths | Rerun from `dashboard/` with repo-relative diff paths adjusted. |
| 6 | Manual rollback's first health probe hit the normal startup gap, but `set -e` exited instead of retrying | Use an explicit `if` health condition, matching activation; service recovered healthy without changing targets. |
