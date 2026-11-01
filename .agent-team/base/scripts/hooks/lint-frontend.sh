#!/bin/bash
# scripts/hooks/lint-frontend.sh: lint only the file that was just edited
# CUSTOMIZE: your frontend's file extensions and linter
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx) npx eslint --fix "$FILE" >/dev/null 2>&1 || true ;;
esac
exit 0
