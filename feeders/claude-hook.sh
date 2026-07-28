#!/bin/bash
# Claude Code hook body. Called from ~/.claude/settings.json hooks (Stop, PostToolUse).
# Receives hook JSON on stdin per Claude Code's hook contract. $1 = event type we assign.
# Must never block or fail the session: always exit 0, all output suppressed by caller.

EVENT_TYPE="$1"
STDIN_JSON=$(cat)

TOOL_NAME=$(echo "$STDIN_JSON" | jq -r '.tool_name // empty' 2>/dev/null)
SESSION_ID=$(echo "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null)
CWD=$(echo "$STDIN_JSON" | jq -r '.cwd // empty' 2>/dev/null)
PROJECT=$(basename "${CWD:-unknown}")

case "$EVENT_TYPE" in
  session.end)
    SUMMARY="Claude Code session ended in ${PROJECT}"
    ;;
  tool.use)
    SUMMARY="Claude Code used ${TOOL_NAME:-a tool} in ${PROJECT}"
    ;;
  *)
    SUMMARY="Claude Code event ${EVENT_TYPE} in ${PROJECT}"
    ;;
esac

DETAIL=$(jq -n --arg project "$PROJECT" --arg session "$SESSION_ID" --arg tool "$TOOL_NAME" --arg event "$EVENT_TYPE" \
  '{project: $project, session_id: $session, tool: $tool, event: $event}')

# DB moved to OVH (ops/OVH-MIGRATION-PLAN.md). No native psql on the Mac, so run
# it in a throwaway container; tailnet IP because MagicDNS doesn't resolve in-container.
ACTIVITY_DB_URL="${ACTIVITY_DB_URL:-postgres://activity:activity@100.101.106.60:5433/activity_log}"
docker run --rm -i -e PG_SUMMARY="$SUMMARY" -e PG_DETAIL="$DETAIL" -e PG_TYPE="claude.${EVENT_TYPE}" postgres:16 psql "$ACTIVITY_DB_URL" -q <<'SQL' >/dev/null 2>&1
\getenv summary PG_SUMMARY
\getenv detail PG_DETAIL
\getenv type PG_TYPE
INSERT INTO activity_log (source, type, summary, detail) VALUES ('claude-code', :'type', :'summary', :'detail'::jsonb);
SQL

exit 0
