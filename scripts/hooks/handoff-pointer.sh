#!/bin/bash
# scripts/hooks/handoff-pointer.sh: SessionStart hook (startup and /clear), for
# Claude Code (.claude/settings.json) and Codex (.codex/hooks.json).
# Points a new session to the latest handoff note written in the last 7 days by
# the handoff skill. It only points: the session reads the note if the user
# continues that work, and ignores it otherwise.
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
DIR="$ROOT/.handoff"
[ -d "$DIR" ] || exit 0
LATEST=$(ls -t "$DIR"/*.md 2>/dev/null | head -1)
[ -n "$LATEST" ] || exit 0
[ -n "$(find "$LATEST" -mtime -7 2>/dev/null)" ] || exit 0
TITLE=$(grep -m1 '^# ' "$LATEST" | sed 's/^# //; s/["\\]//g')
REL=${LATEST#"$ROOT/"}
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"A handoff note from a previous session exists: %s (%s). If the user continues that work, read it before anything else; otherwise ignore it."}}\n' "$REL" "$TITLE"
