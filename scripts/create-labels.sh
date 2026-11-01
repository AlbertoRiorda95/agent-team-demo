#!/bin/bash
# Creates the labels used by the agent workflows on GitHub: agent:<role> for the
# roles this project has (docs/roles/), and the workflow labels.
# Requires an authenticated GitHub CLI (gh auth login).
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
for r in designer frontend backend optimizer devops security writer; do
  [ -f "docs/roles/$r.md" ] || continue
  gh label create "agent:$r" --description "Task for the $r agent" --color 5319e7 --force
done
# agent-team:if team_tasks
gh label create "agent:team" --description "Team task: one agent does every role the task touches, no subagents" --color 5319e7 --force
# agent-team:end
# agent-team:if split and harness_claude
gh label create "agent:split" --description "Ask Claude to propose a split into task issues (split.yml)" --color 5319e7 --force
# agent-team:end
# agent-team:if dispatch
gh label create "hold" --description "dispatch.py never starts this task" --color fbca04 --force
# agent-team:end
gh label create "alignment-needed" --description "An agent changed something other roles rely on" --color d93f0b --force
# agent-team:if harness_claude
gh label create "ai-review" --description "Ask Claude to review this PR (claude-review.yml)" --color 0e8a16 --force
# agent-team:end
