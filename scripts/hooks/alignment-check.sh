#!/bin/bash
# scripts/hooks/alignment-check.sh
# After every delegation, reminds the lead of open alignment entries.
DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}/docs/alignment"
[ -d "$DIR" ] || exit 0
OPEN=$(grep -l '^status: open' "$DIR"/*.md 2>/dev/null | grep -v '/_template.md$' | grep -v '/README.md$')
[ -z "$OPEN" ] && exit 0
echo "Open alignment entries:" >&2
echo "$OPEN" | sed 's#^.*/docs/#  docs/#' >&2
echo "Follow AGENTS.md > Alignment changes: designer first, then the affected roles; in CI, label the MR and stop." >&2
exit 2
