#!/usr/bin/env bash
# Atomically point OVH production at a prior, already-built release.
set -euo pipefail

HOST="${OVH_SSH_HOST:-ovhvps}"
RELEASE_ROOT="${OVH_RELEASE_ROOT:-/home/ubuntu/activity-dashboard}"
TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  ssh "$HOST" "printf 'current -> '; readlink -f '${RELEASE_ROOT}/current' || true; find '${RELEASE_ROOT}/releases' -mindepth 2 -maxdepth 2 -type f -path '*/dashboard/.next/BUILD_ID' -printf '%h\n' 2>/dev/null | sed 's#/.next\$##' | sort -r"
  exit 0
fi

[[ "$TARGET" =~ ^[A-Za-z0-9._:-]+$ ]] || {
  printf 'rollback: invalid release id\n' >&2
  exit 1
}

ssh "$HOST" "flock -n /tmp/activity-dashboard-deploy.lock bash -lc '
  set -euo pipefail
  target=\"${RELEASE_ROOT}/releases/${TARGET}/dashboard\"
  test -s \"\$target/.next/BUILD_ID\"
  ln -sfn \"\$target\" \"${RELEASE_ROOT}/current.next\"
  mv -Tf \"${RELEASE_ROOT}/current.next\" \"${RELEASE_ROOT}/current\"
  sudo systemctl restart activity-dashboard
  for attempt in \$(seq 1 20); do
    systemctl is-active --quiet activity-dashboard &&
      curl -fsS --max-time 3 http://127.0.0.1:3000/channels >/dev/null &&
      exit 0
    sleep 1
  done
  exit 1
'"
printf 'rolled back to %s\n' "$TARGET"

