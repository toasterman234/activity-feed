#!/usr/bin/env bash
# Runs on OVH under the deployment lock. Builds first, then switches `current`.
set -euo pipefail

RELEASE="${1:?release directory required}"
RELEASE_ROOT="${2:-/home/ubuntu/activity-dashboard}"
HEALTH_URL="${3:-http://127.0.0.1:3000/channels}"
APP="${RELEASE}/dashboard"
CURRENT="${RELEASE_ROOT}/current"
PREVIOUS="$(readlink -f "$CURRENT" 2>/dev/null || true)"
ACTIVATED=0

if [[ -z "$PREVIOUS" || ! -d "$PREVIOUS" ]]; then
  printf 'refusing activation without a valid current rollback target: %s\n' "$CURRENT" >&2
  exit 1
fi

rollback() {
  local status=$?
  if [[ "$ACTIVATED" == "1" && -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "${CURRENT}.rollback"
    mv -Tf "${CURRENT}.rollback" "$CURRENT"
    sudo systemctl restart activity-dashboard || true
    printf 'activation failed; restored %s\n' "$PREVIOUS" >&2
  fi
  exit "$status"
}
trap rollback ERR

cd "$APP"
npm ci
npm run build
test -s .next/BUILD_ID

ln -sfn "$APP" "${CURRENT}.next"
mv -Tf "${CURRENT}.next" "$CURRENT"
ACTIVATED=1

sudo systemctl restart activity-dashboard
for _attempt in $(seq 1 20); do
  if systemctl is-active --quiet activity-dashboard &&
    curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    trap - ERR
    printf 'activated %s\n' "$RELEASE"
    exit 0
  fi
  sleep 1
done

printf 'health check did not pass: %s\n' "$HEALTH_URL" >&2
false
