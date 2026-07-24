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

docker exec -i -e PGPASSWORD=activity -e PG_SUMMARY="$SUMMARY" -e PG_DETAIL="$DETAIL" activity-log-db psql -U activity -d activity_log -q <<'SQL' >/dev/null 2>&1
\getenv summary PG_SUMMARY
\getenv detail PG_DETAIL
INSERT INTO activity_log (source, type, summary, detail) VALUES ('git', 'git.commit', :'summary', :'detail'::jsonb);
SQL

exit 0
