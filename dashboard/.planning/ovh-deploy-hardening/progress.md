# Progress

## 2026-07-27

- Verified the recovered production dashboard is healthy.
- Proved Pi model invocation and built-in read tooling work with the route's exact provider spelling.
- Identified invalid Git-root prerequisites and the dangerous in-place deploy path.
- Initialized the hardening plan, findings log, and progress log.
- Added atomic release staging, health-gated activation, rollback tooling, a Pi execution doctor, and a bounded-restart systemd unit.
- Bootstrapped systemd through `/home/ubuntu/activity-dashboard/current` while preserving the recovered live dashboard as the rollback target.
- Corrected the saved Pi provider from `command-code` to `commandcode`; model smoke passes.
- Initialized the recovered OVH production source as a Git descendant of `origin/main`, cloned the verified `ax-brain-crew` remote, and corrected its registry row.
- Passed the Pi provider and temporary worktree smoke for all registered repositories.
- Reconciled the seven incident-recovered runtime/build files back to the Mac without replacing the identical Pi execution files.
- Deployed and activated versioned release `20260727T213025Z-b861edc24ded`; its Linux production build and external health check passed.
- Verified manual rollback selection and startup retry behavior against the active built release.
- Verified systemd is active with zero automatic restarts, a five-per-five-minute start limit, local HTTP 200, and external HTTPS 200.
- Focused execution contract tests pass (10/10). Local macOS webpack idled, but the authoritative OVH Linux production build passed.
- Committed explicit task paths locally as `c20daa1` and `0883214`; unrelated staged Pi files remain staged and untouched.
