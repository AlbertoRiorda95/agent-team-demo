#!/bin/bash
# scripts/hooks/lint-frontend.sh: lint only the file that was just edited
# Orders: TypeScript/React files of the web app, linted with its ESLint config
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
case "$FILE" in
  */apps/web/*.ts|*/apps/web/*.tsx|apps/web/*.ts|apps/web/*.tsx)
    (cd "${CLAUDE_PROJECT_DIR:-.}/apps/web" 2>/dev/null && npx eslint --fix "$FILE" >/dev/null 2>&1) || true ;;
esac
exit 0
