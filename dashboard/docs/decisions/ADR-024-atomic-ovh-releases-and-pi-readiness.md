# ADR-024: Atomic OVH releases and verified Pi execution

## Status

Accepted and implemented — 2026-07-27.

## Context

The dashboard was deployed by running `rsync --delete` directly against the
live application directory and then building there. An older Mac working tree
removed production-only source, and the service repeatedly restarted without a
valid `.next` build. The same incident review found that Pi's explicit
dashboard invocation worked, but the saved provider name was invalid and two
repository registrations were not Git roots, so execution-stage worktree setup
would fail before Pi started.

## Decision

1. Production runs through `/home/ubuntu/activity-dashboard/current`.
2. A deploy creates a versioned candidate under
   `/home/ubuntu/activity-dashboard/releases`, builds it before activation,
   atomically changes `current`, and checks local HTTP health.
3. Failed activation restores the prior `current` target and restarts it.
4. The deploy lock serializes install, build, activation, and rollback.
5. Deploys require a clean dashboard Git tree by default. A dirty deploy needs
   the explicit, visible `OVH_ALLOW_DIRTY=1` override.
6. systemd checks for `.next/BUILD_ID` before starting and uses bounded
   `Restart=on-failure` retries.
7. `scripts/pi-execution-doctor.sh` is the readiness contract for the Pi
   binary, provider/model config, registered Git roots, provider invocation,
   and temporary worktree creation.
8. Execution repository paths must be exact Git roots. Production source is a
   Git checkout; other projects use verified clones under
   `/home/ubuntu/Projects`.

## Consequences

- An upload or build failure cannot delete or replace the active build.
- A bad release is rolled back automatically; an operator can also run
  `npm run rollback:ovh -- <release-id>`.
- systemd stops retrying after five failures in five minutes instead of
  crash-looping forever.
- The deploy refuses ambiguous, uncommitted source by default.
- Pi execution readiness can be checked without creating dashboard data:
  `scripts/pi-execution-doctor.sh --smoke --worktree-smoke <git-root>`.
- The first recovered production tree remains the rollback target until a
  successful versioned release replaces it.

## Recovery procedure

```bash
# Inspect current and available releases
npm run rollback:ovh

# Activate a known-good built release
npm run rollback:ovh -- 20260727T220000Z-abcdef123456

# Verify Pi plus the worktree lifecycle on OVH
ssh ovhvps \
  '~/activity-feed/dashboard/scripts/pi-execution-doctor.sh --smoke \
  --worktree-smoke /home/ubuntu/activity-feed'
```

## References

- [ADR-005](ADR-005-production-host-ovh.md) — OVH is the production host
- [ADR-011](ADR-011-durable-work-runs.md) — durable work runs
- [ADR-023](ADR-023-pi-execution-hosting.md) — superseded hosting analysis

