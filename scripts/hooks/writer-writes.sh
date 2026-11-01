#!/bin/bash
# scripts/hooks/writer-writes.sh
# The writer agent writes only under docs/software/ and the project README.md.
command -v jq >/dev/null || { echo "Blocked: jq is not installed, so this hook cannot check the call. Install jq." >&2; exit 2; }   # never fail open
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
case "$FILE" in
  docs/software/*|*/docs/software/*) exit 0 ;;
  README.md|*/README.md)
    # only the project's README, not one inside another folder
    [ "$FILE" = "README.md" ] || [ "$(dirname "$FILE")" = "${CLAUDE_PROJECT_DIR:-$(pwd)}" ] && exit 0 ;;
esac
echo "Blocked: the writer agent writes only under docs/software/ and the project README.md. Report anything else in the MR." >&2
exit 2
