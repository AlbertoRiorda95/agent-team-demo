#!/bin/bash
# scripts/hooks/security-writes.sh
# The security agent writes only its reports, under docs/security/.
command -v jq >/dev/null || { echo "Blocked: jq is not installed, so this hook cannot check the call. Install jq." >&2; exit 2; }   # never fail open
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
case "$FILE" in
  docs/security/*|*/docs/security/*) exit 0 ;;
esac
echo "Blocked: the security agent writes only under docs/security/. Put the fix in the report." >&2
exit 2
