# Findings: pnpm Migration

## Baseline Inventory (from prior session, 2026-08-01)

### npm repos to convert (~3.6 GB total)

| # | Repo | node_modules | Lockfile |
|---|------|-------------|----------|
| 1 | `activity-feed/dashboard` | 848 MB | package-lock.json |
| 2 | `sandbox/ax` | 597 MB | package-lock.json |
| 3 | `ax-brain-crew/apps/lab` | 585 MB | package-lock.json |
| 4 | `sandbox/agent-team-platform` | 533 MB | package-lock.json |
| 5 | `ax-brain-crew` (root) | 295 MB | package-lock.json |
| 6 | `flue-2.0-experiment` | 235 MB | package-lock.json |
| 7 | `ax-brain-crew/curbcritic-frontend` | 156 MB | package-lock.json |
| 8 | `activegraph-experiment/ui` | 141 MB | package-lock.json |
| 9 | `ax-llm` | 106 MB | package-lock.json |
| 10 | `cronicle-worker` | 80 MB | package-lock.json |
| 11 | `ax-brain-crew/apps/triage-review` | 67 MB | package-lock.json |

### Already on pnpm (do not touch)
- `piflow/PiFlow` — pnpm-lock.yaml
- `ax-control-plane` — pnpm-lock.yaml
- `ax-llm/apps/web` — pnpm-lock.yaml
- `electric-circuits` — pnpm-lock.yaml

### Conversion method
```
rm -rf node_modules package-lock.json
pnpm import   # converts package-lock.json → pnpm-lock.yaml (preferred)
# OR
pnpm install  # fresh install, generates pnpm-lock.yaml
git add pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "migrate: npm → pnpm"
```

## Phase 1 Findings (2026-08-01)

### pnpm version
- pnpm 10.32.1 via Homebrew ✅

### Git cleanliness
**ALL repos are dirty.** Must commit or stash before converting.

| Repo | Dirty lines |
|------|-------------|
| dashboard | 169 (mostly data snapshots) |
| ax-brain-crew | 56 |
| cronicle-worker | 22 |
| ax-llm | 14 |
| sandbox/ax | 5 |
| sandbox/agent-team-platform | 2 |
| flue-2.0-experiment | not a git repo |
| activegraph-experiment/ui | not a git repo |

### npm-specific lifecycle scripts (will need pnpm equivalents)

| Repo | Scripts | Risk |
|------|---------|------|
| `sandbox/ax` | `prepare`, `website:prepare` | HIGH — `prepare` hooks run automatically |
| `cronicle-worker` | `postinstall`, `preuninstall` | HIGH — lifecycle hooks |
| All others | None detected | LOW |

### CI/CD hardcoded npm references (will need updating)

| Repo | Files |
|------|-------|
| `sandbox/ax` | `.github/workflows/npm-publish.yml`, `static.yml`, `ci.yml`, `PULL_REQUEST_TEMPLATE.md` |
| `sandbox/agent-team-platform` | `.github/workflows/agent-quality.yml` |
| `ax-brain-crew` | `.github/workflows/ci.yml` (uses `npm ci`, `cache: npm`) |
| `activity-feed/dashboard` | `scripts/start-production.sh`, `activate-ovh-release.sh`, `seed-verification-profiles.mjs`, `mobile-perf-report.mjs`, `package.json` |
| `ax-llm` | No .github dir |
| `cronicle-worker` | No .github dir |

### Workspace structure
- `ax-brain-crew`: No npm workspaces configured. Each subdir (`apps/lab`, `curbcritic-frontend`, `apps/triage-review`) has its own package.json — these are independent packages, not a monorepo.
- `ax-llm`: No workspaces configured.
- Good news: no monorepo breakage risk. Each package converts independently.

### Known risks
- pnpm's strict dependency resolution (doesn't hoist undeclared deps by default)
- npm-specific postinstall scripts may fail
- CI configs that hardcode `npm` commands
- Dashboard deploy scripts hard-reference `npm` — OVH deployment pipeline must be updated
- All repos are dirty — must commit/stash before converting
