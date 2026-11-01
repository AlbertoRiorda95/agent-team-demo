#!/bin/bash
# Installs the recommended skills into the project.
# CUSTOMIZE: remove the lines that don't fit your stack (React, Postgres, GitHub Actions).
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# One copy per harness of this project: Claude Code reads .claude/skills/,
# Codex and OpenCode the shared .agents/skills/.
A=()
[ -d .claude ] && A+=(-a claude-code)
[ -d .codex ] && A+=(-a codex)
[ -d .opencode ] && A+=(-a opencode)
[ ${#A[@]} -gt 0 ] || { echo "no harness folder (.claude, .codex, .opencode)" >&2; exit 1; }
npx skills add anthropics/skills -s frontend-design -s webapp-testing "${A[@]}" -y
npx skills add vercel-labs/agent-skills -s web-design-guidelines -s vercel-react-best-practices "${A[@]}" -y
npx skills add mattpocock/skills -s tdd -s diagnosing-bugs -s retro -s writing-for-agents "${A[@]}" -y
npx skills add supabase/agent-skills -s supabase-postgres-best-practices "${A[@]}" -y
npx skills add getsentry/skills -s security-review -s code-simplifier -s gha-security-review "${A[@]}" -y
npx skills add wshobson/agents -s api-design-principles -s github-actions-templates "${A[@]}" -y
