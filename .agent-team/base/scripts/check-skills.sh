#!/bin/bash
# Checks the skills after scripts/install-skills.sh:
# - every skill named in an agent's `skills:` field is installed in .claude/skills/
#   (Claude Code ignores a wrong name silently: the agent starts without the skill);
# - lists the scripts shipped with the installed skills, to read before first use.
# Exit code 1 if a skill is missing.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
missing=0
for f in .claude/agents/*.md; do
  [ -f "$f" ] || continue   # Claude Code agents only: Codex and OpenCode have no preloaded skills
  while read -r skill; do
    [ -z "$skill" ] && continue
    case "$skill" in
      *:*) echo "note: $f preloads plugin skill '$skill': check it with /plugin" ;;
      *) if [ ! -f ".claude/skills/$skill/SKILL.md" ]; then
           echo "MISSING: $f preloads '$skill', not found in .claude/skills/"
           missing=1
         fi ;;
    esac
  done < <(awk 'NR==1 && /^---/ {fm=1; next}
                fm && /^---/ {exit}
                fm && /^skills:/ {s=1; next}
                fm && s && /^[[:space:]]+-[[:space:]]/ {sub(/^[[:space:]]+-[[:space:]]+/, ""); gsub(/["\047[:space:]]/, ""); print; next}
                fm && s && /^[^[:space:]]/ {s=0}' "$f")
done
echo
echo "Installed skills:"
ls -1 .claude/skills .agents/skills 2>/dev/null | sed 's/^/  /'
echo
echo "Scripts shipped with the skills (read them before the first real task):"
find .claude/skills .agents/skills -type f 2>/dev/null \( -name '*.sh' -o -name '*.py' -o -name '*.js' -o -name '*.mjs' -o -name '*.ts' \) \
  -not -path '*/node_modules/*' | sort | sed 's/^/  /'
[ "$missing" -eq 0 ] && echo && echo "OK: every preloaded skill is installed."
exit "$missing"
