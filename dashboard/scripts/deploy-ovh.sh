#!/usr/bin/env bash
# Stage, build, and atomically activate an OVH dashboard release.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${OVH_SSH_HOST:-ovhvps}"
RELEASE_ROOT="${OVH_RELEASE_ROOT:-/home/ubuntu/activity-dashboard}"
HEALTH_URL="${OVH_HEALTH_URL:-http://127.0.0.1:3000/channels}"
ALLOW_DIRTY="${OVH_ALLOW_DIRTY:-0}"

cd "$ROOT"

die() {
  printf 'deploy: %s\n' "$*" >&2
  exit 1
}

command -v git >/dev/null || die "git is required"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  die "$ROOT is not in a Git working tree"

if [[ "$ALLOW_DIRTY" != "1" ]] && [[ -n "$(git status --porcelain --untracked-files=normal -- .)" ]]; then
  die "dashboard source is dirty; commit the intended release or set OVH_ALLOW_DIRTY=1 explicitly"
fi

git_sha="$(git rev-parse --short=12 HEAD)"
dirty=false
[[ -n "$(git status --porcelain --untracked-files=normal -- .)" ]] && dirty=true
release_id="$(date -u +%Y%m%dT%H%M%SZ)-${git_sha}-$$"
remote_release="${RELEASE_ROOT}/releases/${release_id}"
remote_incoming="${RELEASE_ROOT}/.incoming-${release_id}"

printf '==> export deployment snapshots\n'
node scripts/export-subscriptions-snapshot.mjs
node scripts/export-registry-snapshot.mjs
# Finance export can hang on a dead NFS/mount (quant-research-pipeline). The
# script itself times out per-file; this outer bound keeps deploy moving even
# if Node itself wedges, reusing the last good snapshot when present.
if ! node scripts/export-finance-research-snapshot.mjs; then
  if [[ -f data/finance-research.snapshot.json ]]; then
    printf 'deploy: finance snapshot export failed; reusing existing snapshot\n' >&2
  else
    die "finance snapshot export failed and no existing snapshot to reuse"
  fi
fi

printf '==> stage %s on %s\n' "$release_id" "$HOST"
ssh "$HOST" "mkdir -p '${remote_incoming}/dashboard' '${RELEASE_ROOT}/releases' && ln -sfn /home/ubuntu/activity-feed/electric-circuits '${remote_incoming}/electric-circuits'"

# --delete is intentionally scoped to a new, non-live incoming directory.
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude .planning \
  --exclude tmp \
  --exclude tmp-qa \
  --exclude 'interceptor-screenshot-*.png' \
  --exclude '.env*.local' \
  "${ROOT}/" "${HOST}:${remote_incoming}/dashboard/"

manifest="$(printf '{"release":"%s","git_sha":"%s","dirty":%s,"deployed_at":"%s","source_host":"%s"}\n' \
  "$release_id" "$git_sha" "$dirty" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(hostname)")"
printf '%s' "$manifest" | ssh "$HOST" "cat > '${remote_incoming}/manifest.json'"

printf '==> build candidate before activation\n'
ssh "$HOST" \
  "flock -n /tmp/activity-dashboard-deploy.lock bash -lc '
    set -euo pipefail
    test ! -e \"${remote_release}\"
    mv \"${remote_incoming}\" \"${remote_release}\"
    \"${remote_release}/dashboard/scripts/activate-ovh-release.sh\" \
      \"${remote_release}\" \"${RELEASE_ROOT}\" \"${HEALTH_URL}\"
  '" || {
    die "candidate failed; the previous release remains active (or was restored)"
  }

printf '==> external health\n'
curl -fsS --max-time 15 "https://ovh-vps.taila1553c.ts.net:8446/channels" >/dev/null
mkdir -p data
printf '{"release":"%s","git_sha":"%s","dirty":%s,"deployed_at":"%s"}\n' \
  "$release_id" "$git_sha" "$dirty" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > data/last-deploy.json
printf 'deployed %s\n' "$release_id"
