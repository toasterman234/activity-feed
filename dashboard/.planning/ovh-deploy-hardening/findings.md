# Findings

- The live dashboard invokes `/home/ubuntu/.local/bin/pi` with provider `commandcode`; real no-tool and tool-enabled smoke tests both passed.
- `/home/ubuntu/.commandcode/config.json` stores provider `command-code`, which Pi rejects when used directly.
- No rows exist in `work_runs`; the dashboard execution-stage pipeline has not yet completed an end-to-end run.
- `graph-continuity-b-c-d` is a valid Git root on OVH.
- Registered `activity-feed` points to `/home/ubuntu/activity-feed`, which is not a Git repository.
- Registered `ax-brain-crew` incorrectly points to `/home/ubuntu/activity-feed`.
- The current deploy script still performs an in-place `rsync -az --delete`, then builds in the live directory.
- Production is currently healthy and must remain the rollback target during hardening.
- The first atomic release built successfully on Linux and is now selected by
  `/home/ubuntu/activity-dashboard/current`.
- A local macOS webpack build became idle after Serwist bundling, while the
  identical OVH build compiled and generated all routes successfully.
