#!/bin/bash
# Production launcher for the Activity Feed dashboard.
#
# Serves Next.js on 0.0.0.0:3000 so Tailscale Serve can terminate TLS in front
# of it. Canonical phone URL (HTTP/2):
#   https://bens-mac-mini.taila1553c.ts.net:8446
#
# Port policy:
#   :3000  — production only (this script / launchd). Tailscale Serve targets it.
#   :3010  — local `npm run dev`. Never bind next-dev to :3000 while Serve is up.
#
# MUST `exec` next so launchd tracks it directly. Backgrounding npm and waiting
# left orphan next-server processes (ppid 1) after kickstart -k, which accepted
# TCP on :3000 but never answered — the whole PWA looked dead (2026-07-25).

set -euo pipefail

ROOT="/Users/bencharney/activity-feed/dashboard"
NPM="/Users/bencharney/.local/bin/npm"
PORT=3000
HOST="0.0.0.0"
SERVE_HTTPS_PORT=8446
LOG_PREFIX="[activityfeed-dashboard]"

cd "$ROOT"
export PATH="/Users/bencharney/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export NODE_ENV=production
export HOSTNAME="$HOST"
export PORT

log() { echo "$LOG_PREFIX $*"; }
warn() { echo "$LOG_PREFIX WARN: $*" >&2; }
die() { echo "$LOG_PREFIX ERROR: $*" >&2; exit 1; }

if command -v tailscale >/dev/null 2>&1; then
  if ! tailscale serve status 2>/dev/null | grep -q ":${SERVE_HTTPS_PORT} "; then
    log "binding Tailscale Serve https:${SERVE_HTTPS_PORT} → http://127.0.0.1:${PORT}"
    tailscale serve --bg --https="$SERVE_HTTPS_PORT" "http://127.0.0.1:${PORT}" || \
      warn "tailscale serve failed — HTTPS URL may be down"
  else
    log "Tailscale Serve https:${SERVE_HTTPS_PORT} already bound"
  fi
else
  warn "tailscale not on PATH"
fi

if [[ ! -f .next/BUILD_ID ]]; then
  log "no production build — running npm run build"
  "$NPM" run build
fi

is_next_cmd() {
  # Match real next binaries only — never a shell whose argv happens to mention next.
  echo "$1" | grep -Eq '(^|/)(next-server|next)( |$)|next start|/next/dist/'
}

# Free :3000 of stale next listeners only (by lsof, not broad pgrep).
if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  log "clearing next listeners on :$PORT"
  for pid in $(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true); do
    cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
    if is_next_cmd "$cmd"; then
      log "killing pid $pid ($cmd)"
      kill "$pid" 2>/dev/null || true
    fi
  done
  sleep 1
  for pid in $(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true); do
    cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
    if is_next_cmd "$cmd"; then
      log "force-killing pid $pid"
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  sleep 1
fi

foreign=()
for pid in $(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true); do
  cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
  if ! is_next_cmd "$cmd"; then
    bind=$(lsof -nP -a -p "$pid" -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $9}' | head -1)
    foreign+=("pid=$pid bind=${bind:-?} cmd=$cmd")
  fi
done
if ((${#foreign[@]} > 0)); then
  die "refusing to start: :${PORT} owned by a non-dashboard process. Holders: ${foreign[*]}"
fi

log "starting next start -H $HOST -p $PORT (exec — launchd tracks next directly)"
log "canonical URL: https://bens-mac-mini.taila1553c.ts.net:${SERVE_HTTPS_PORT}"
exec "$NPM" run start -- -H "$HOST" -p "$PORT"
