#!/bin/bash
# scripts/hooks/role-hooks.sh <pre|post>: the hooks of one role, for Claude Code
# (.claude/settings.json). Claude Code names the agent making the tool call in
# agent_type: a role subagent, or the session started with `claude --agent <role>`
# (how the CI runs a role). The lead session has none, and none of these apply.
# They live here, not in the agents' frontmatter, because Claude Code skips
# frontmatter hooks in a folder that is not trusted, which is every headless run.
# A role this project does not have has no script, and nothing runs.
command -v jq >/dev/null || { echo "Blocked: jq is not installed, so this hook cannot check the call. Install jq." >&2; exit 2; }   # never fail open
INPUT=$(cat)
AGENT=$(echo "$INPUT" | jq -r '.agent_type // empty')
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
[ -n "$AGENT" ] || exit 0
H="$(cd "$(dirname "$0")" && pwd)"

case "$1:$AGENT:$TOOL" in
  pre:writer:Write|pre:writer:Edit)       S=writer-writes.sh ;;
  pre:security:Write|pre:security:Edit)   S=security-writes.sh ;;
  pre:security:Bash)                      S=security-scope.sh ;;
  post:frontend:Write|post:frontend:Edit) S=lint-frontend.sh ;;
  post:team:Write|post:team:Edit)         S=lint-frontend.sh ;;   # team holds the frontend role too
  *) exit 0 ;;
esac
[ -x "$H/$S" ] || exit 0
echo "$INPUT" | "$H/$S"
