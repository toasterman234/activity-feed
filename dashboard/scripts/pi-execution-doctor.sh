#!/usr/bin/env bash
# Validate the dashboard's Pi and Git-worktree execution prerequisites.
set -uo pipefail

PI_BIN="${CHANNEL_PI_BIN:-/home/ubuntu/.local/bin/pi}"
PI_CONFIG="${PI_CONFIG:-/home/ubuntu/.commandcode/config.json}"
DB_CONTAINER="${ACTIVITY_DB_CONTAINER:-activity-log-db}"
RUN_SMOKE=0
WORKTREE_REPO=""
failures=0

while (($#)); do
  case "$1" in
    --smoke) RUN_SMOKE=1 ;;
    --worktree-smoke)
      shift
      WORKTREE_REPO="${1:?--worktree-smoke requires a repository path}"
      ;;
    *)
      printf 'unknown argument: %s\n' "$1" >&2
      exit 2
      ;;
  esac
  shift
done

pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; failures=$((failures + 1)); }

if [[ -x "$PI_BIN" ]]; then
  pass "Pi binary: $PI_BIN"
else
  fail "Pi binary is missing or not executable: $PI_BIN"
fi

provider="$(node -e 'const fs=require("fs"); const p=process.argv[1]; const x=JSON.parse(fs.readFileSync(p)); process.stdout.write(String(x.provider||""))' "$PI_CONFIG" 2>/dev/null || true)"
model="$(node -e 'const fs=require("fs"); const p=process.argv[1]; const x=JSON.parse(fs.readFileSync(p)); process.stdout.write(String(x.model||""))' "$PI_CONFIG" 2>/dev/null || true)"
if [[ "$provider" == "commandcode" ]]; then
  pass "Pi provider: $provider"
else
  fail "Pi provider must be commandcode, found: ${provider:-<missing>}"
fi
[[ -n "$model" ]] && pass "Pi model: $model" || fail "Pi model is missing"

if docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  while IFS='|' read -r id name repo_path; do
    [[ -n "$id" ]] || continue
    root="$(git -C "$repo_path" rev-parse --show-toplevel 2>/dev/null || true)"
    if [[ "$root" == "$repo_path" ]]; then
      pass "repository $name: $repo_path"
    else
      fail "repository $name is not an exact Git root: $repo_path"
    fi
  done < <(docker exec "$DB_CONTAINER" psql -U activity -d activity_log -At -F '|' \
    -c 'select id,name,path from repos order by name' 2>/dev/null)
else
  fail "database container not found: $DB_CONTAINER"
fi

if [[ "$RUN_SMOKE" == "1" && -x "$PI_BIN" && "$provider" == "commandcode" && -n "$model" ]]; then
  output="$(timeout 90 "$PI_BIN" -p --mode text --no-session --no-tools --thinking off \
    --provider "$provider" --model "$model" 'Reply with exactly: pi-smoke-ok' 2>&1 || true)"
  [[ "$output" == *"pi-smoke-ok"* ]] && pass "Pi provider invocation" ||
    fail "Pi provider invocation failed: ${output:0:240}"
fi

if [[ -n "$WORKTREE_REPO" ]]; then
  smoke_root="$(git -C "$WORKTREE_REPO" rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ "$smoke_root" != "$WORKTREE_REPO" ]]; then
    fail "worktree smoke path is not an exact Git root: $WORKTREE_REPO"
  else
    smoke_id="doctor-$(date +%s)-$$"
    smoke_dir="$(mktemp -d /tmp/activity-worktree-doctor.XXXXXX)"
    rmdir "$smoke_dir"
    if git -C "$WORKTREE_REPO" worktree add -q -b "codex/${smoke_id}" "$smoke_dir" HEAD &&
      git -C "$smoke_dir" rev-parse --is-inside-work-tree >/dev/null; then
      pass "temporary worktree creation"
    else
      fail "temporary worktree creation"
    fi
    git -C "$WORKTREE_REPO" worktree remove --force "$smoke_dir" >/dev/null 2>&1 || true
    git -C "$WORKTREE_REPO" branch -D "codex/${smoke_id}" >/dev/null 2>&1 || true
  fi
fi

if ((failures)); then
  printf '%d check(s) failed\n' "$failures" >&2
  exit 1
fi
printf 'Pi execution prerequisites are healthy\n'
