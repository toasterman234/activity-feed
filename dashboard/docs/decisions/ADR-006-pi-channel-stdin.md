# ADR-006: Spawn `pi` with stdin ignored (never Node `execFile`)

## Status

Accepted — fixed 2026-07-26.

## Context

After the OVH cutover (ADR-005), channel `@pi` mentions call the `pi` CLI
directly from `src/app/api/channels/trigger/route.ts` (no Paseo). Mentions
failed with:

```
Failed to respond: Error: Command failed: /home/ubuntu/.local/bin/pi -p …
```

The UI truncated the error at 400 chars, hiding the real failure mode.
Journal showed:

```
code: null,
killed: true,
signal: 'SIGTERM',
stdout: '',
stderr: ''
```

Timing matched the route’s `620_000` ms `execFile` timeout (~10m). The same
`pi` argv completed in ~5s when run from an interactive SSH shell.

## Decision

**Never spawn `pi` (or any CLI that may wait on stdin) via Node
`child_process.execFile` / `promisify(execFile)`.**

Use [`src/lib/execFileNoStdin.ts`](../../src/lib/execFileNoStdin.ts), which
wraps `spawn` with `stdio: ['ignore', 'pipe', 'pipe']`.

Channel mention jobs in `trigger/route.ts` already use this helper. Any new
server-side `pi -p …` call must do the same.

## Why

Node’s `execFile` always uses `stdio: ['pipe', 'pipe', 'pipe']` and leaves
stdin open. `pi -p` treats that open pipe as “still reading input” and hangs
forever with empty stdout/stderr until the parent timeout sends `SIGTERM`.

Shell / TTY / `stdio: ['ignore', …]` closes or never opens stdin, so `pi`
exits normally.

Minimal repro on the VPS:

| spawn stdio | result |
|---|---|
| `['pipe','pipe','pipe']` (execFile default) | hang → SIGTERM, empty output |
| `['ignore','pipe','pipe']` | success in ~5s |

## Consequences

### Positive
- Channel `@mentions` reply in seconds instead of failing after 10 minutes.
- Failure messages now include `signal=` / `stderr=` so the next hang is
  diagnosable from the thread UI, not only journalctl.

### Negative / tradeoffs
- `execFileNoStdin` is a small custom helper (must keep timeout / maxBuffer
  behavior in sync with call sites). Do not “simplify” back to `execFile`.

## Do not regress

- Do **not** call `execFile` / `execFileAsync` for `pi`.
- Do **not** “fix” hangs by raising the 620s timeout — that only delays the
  same SIGTERM.
- Shell `bash -lc` workflow commands in the same route may keep using
  `execFile`; the bug is specific to CLIs that wait on an open stdin pipe.
  Prefer `execFileNoStdin` for any new non-interactive agent CLI anyway.

## References

- Helper: `dashboard/src/lib/execFileNoStdin.ts`
- Call site: `dashboard/src/app/api/channels/trigger/route.ts`
- Agent rules: `dashboard/AGENTS.md` (Channel @mentions / pi spawn)
- Runbook: `openwiki/deployment/ovh-production.md` § Channel @mentions
