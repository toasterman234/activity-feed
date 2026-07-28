#!/bin/bash
# Shared post-commit hook body. Each repo's .git/hooks/post-commit calls this script.
# Writes one row to activity_log per commit. Fails silently (never blocks a commit).

REPO_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null)
COMMIT_MSG=$(git log -1 --pretty=%s 2>/dev/null)
FILES_CHANGED=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | head -50 | jq -R . | jq -s .)
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

[ -z "$REPO_NAME" ] && exit 0

SUMMARY="commit ${COMMIT_HASH} in ${REPO_NAME}: ${COMMIT_MSG}"
DETAIL=$(jq -n \
  --arg repo "$REPO_NAME" \
  --arg branch "$BRANCH" \
  --arg hash "$COMMIT_HASH" \
  --arg msg "$COMMIT_MSG" \
  --argjson files "$FILES_CHANGED" \
  '{repo: $repo, branch: $branch, hash: $hash, message: $msg, files: $files}')

# DB moved to OVH (ops/OVH-MIGRATION-PLAN.md). No native psql on the Mac, so run
# it in a throwaway container; tailnet IP because MagicDNS doesn't resolve in-container.
ACTIVITY_DB_URL="${ACTIVITY_DB_URL:-postgres://activity:activity@100.101.106.60:5433/activity_log}"
docker run --rm -i -e PG_SUMMARY="$SUMMARY" -e PG_DETAIL="$DETAIL" postgres:16 psql "$ACTIVITY_DB_URL" -q <<'SQL' >/dev/null 2>&1
\getenv summary PG_SUMMARY
\getenv detail PG_DETAIL
INSERT INTO activity_log (source, type, summary, detail) VALUES ('git', 'git.commit', :'summary', :'detail'::jsonb);
SQL

exit 0
