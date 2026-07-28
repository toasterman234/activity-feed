#!/bin/bash
# Installs the shared post-commit hook into every repo in WATCH_PROJECTS
# (and any extra repos passed as args). Safe to re-run — skips if the hook
# already points at git-post-commit.sh; backs up a foreign hook first.
#
# Usage:
#   ./feeders/install-git-hooks.sh            # whitelist only
#   ./feeders/install-git-hooks.sh foo bar    # whitelist + extras

set -euo pipefail
HOME_DIR="${HOME}"
FEEDER="$(cd "$(dirname "$0")" && pwd)/git-post-commit.sh"
HOOK_BODY="#!/bin/bash
# Installed by activity-feed/feeders/install-git-hooks.sh — do not edit.
bash \"$FEEDER\"
"

# Keep in sync with WATCH_PROJECTS in feeders/git-post-commit.sh
PROJECTS=(
  activity-feed
  ax-brain-crew
  ax-control-plane
  ax-llm
  ben-workspace
  central-ops-dashboard
  central-repo-ops
  chorus
  collie
  cronicle-worker
  electra-pwa
  interceptor
  market-lake-serve
  omp-control-panel
  omp-control-panel-pwa
  personal-ops
  pi
  pi-agent-dashboard
  rlm-sandbox
  smithers-deploy
  thesis-investment-os
)

# Append any CLI extras
PROJECTS+=("$@")

installed=0; skipped=0; missing=0; backed=0
for name in "${PROJECTS[@]}"; do
  root="$HOME_DIR/$name"
  gitdir="$root/.git"
  if [ ! -d "$gitdir" ]; then
    echo "MISS  $name (no .git)"
    missing=$((missing+1))
    continue
  fi
  # worktrees: .git is a file pointing elsewhere
  if [ -f "$gitdir" ]; then
    gitdir=$(git -C "$root" rev-parse --git-dir)
  fi
  hook="$gitdir/hooks/post-commit"
  mkdir -p "$(dirname "$hook")"
  if [ -f "$hook" ] && grep -q 'git-post-commit.sh' "$hook" 2>/dev/null; then
    echo "OK    $name (already installed)"
    skipped=$((skipped+1))
    continue
  fi
  if [ -f "$hook" ]; then
    mv "$hook" "$hook.bak-activityfeed"
    echo "BACKUP $name -> post-commit.bak-activityfeed"
    backed=$((backed+1))
  fi
  printf '%s' "$HOOK_BODY" > "$hook"
  chmod +x "$hook"
  echo "INST  $name"
  installed=$((installed+1))
done

echo
echo "done: installed=$installed skipped=$skipped backed_up=$backed missing=$missing"
