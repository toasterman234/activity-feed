# Task Plan: pnpm Migration for npm Repos

## Goal
Convert ~11 first-party npm repos to pnpm to deduplicate node_modules (~3.6 GB → ~1-1.5 GB estimated savings), speed up installs, and stop disk pressure from duplicated package copies across projects.

## Background
- 228 GB internal SSD, consistently near-full
- ~11 active npm projects duplicating ~3.6 GB in node_modules
- pnpm uses a single content-addressable store (`~/.pnpm-store`), so identical packages across projects are hard-linked, not copied
- 4 repos already use pnpm (piflow/PiFlow, ax-control-plane, ax-llm/apps/web, electric-circuits) — pattern is proven

## Phases

### Phase 1: Baseline Inventory & Pre-Flight Checks
- [x] 1.1 Verify each repo's current state (ALL dirty — must commit/stash before converting)
- [x] 1.2 Record exact node_modules size per repo (3.6 GB total — see findings)
- [x] 1.3 Check each repo for npm-specific scripts (sandbox/ax: `prepare`; cronicle-worker: `postinstall`, `preuninstall`)
- [x] 1.4 Check each repo for CI/CD configs that hardcode npm (4 repos affected — see findings)
- [x] 1.5 Verify pnpm is installed and available (v10.32.1 via Homebrew)
- **Status:** complete

### Phase 2: Convert Repos (batch of 3-4 at a time, verify after each)
- [ ] 2.1 Convert: `sandbox/ax`, `sandbox/agent-team-platform`, `flue-2.0-experiment` (lowest risk — sandbox dirs)
- [ ] 2.2 Convert: `ax-brain-crew` (root) + `ax-brain-crew/apps/lab` + `ax-brain-crew/curbcritic-frontend` + `ax-brain-crew/apps/triage-review`
- [ ] 2.3 Convert: `ax-llm` (root), `cronicle-worker`, `activegraph-experiment/ui`
- [ ] 2.4 Convert: `activity-feed/dashboard`
- **Status:** pending

### Phase 3: Verification & Cleanup
- [ ] 3.1 Measure total node_modules size after all conversions
- [ ] 3.2 Verify pnpm store location and size
- [ ] 3.3 Record savings in progress.md
- [ ] 3.4 Update cleaner to handle pnpm store if needed
- **Status:** pending

## Decisions
| Decision | Rationale |
|---|---|
| Batch sandbox repos first | Lowest risk — if something breaks, no production impact |
| `activity-feed/dashboard` last | OVH deployment depends on it; verify pattern on others first |
| Leave existing pnpm repos untouched | They already work; no changes needed |
| Don't touch monorepo workspaces | ax-brain-crew likely uses npm workspaces — needs special handling |

## Errors
| Phase | Error | Attempt | Resolution |
|---|---|---|---|
| — | — | — | — |
