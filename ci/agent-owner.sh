#!/bin/bash
# ci/agent-owner.sh: who owns a task. The agent that starts on an issue is the
# only one that works on it and on its pull or merge request afterwards: same
# role (folders, skills, hooks), same tool, same model.
# - The role is the issue's agent:<role> label.
# - The tool is its runner:<tool> label, added the first time an agent starts
#   on the issue, so it does not change while the task is open. To move a task
#   to another tool, remove the label and start the task again.
#
#   github   for agents.yml and claude.yml. Reads the event from the environment:
#            EVENT (issues, issue_comment, pull_request_review_comment), NUMBER
#            (the issue or pull request), IS_PR (true on a pull request), LABEL
#            (the label just added, issues event), RUNNERS (AGENT_RUNNERS),
#            DEFAULT_RUNNER, RECORD_RUNNER=1 to add the runner label. Prints
#            label, role, runner, issue, pr, branch, mode (task or iterate), request (true when
#            the issue has the request label) as
#            key=value lines for $GITHUB_OUTPUT, and why=... when nobody owns it
#            (empty role).
#   gitlab HARNESS   for .gitlab/ci/agents.yml, with TASK_ID: prints the role of
#            the task, adds runner:HARNESS when the task has no tool yet, and fails
#            if another tool or another role (AI_FLOW_ROLE) owns it.
set -euo pipefail

roles() { grep '^agent:' | grep -vx 'agent:split' || true; }

github() {
  local issue="" pr="" branch="" label="" mode=iterate labels runner
  if [ "$EVENT" = issues ]; then
    issue=$NUMBER label=$LABEL mode=task
  elif [ "${IS_PR:-}" = true ]; then
    pr=$NUMBER
    local view
    view=$(gh pr view "$pr" --json headRefName,isCrossRepository,closingIssuesReferences)
    if [ "$(jq -r .isCrossRepository <<<"$view")" = true ]; then
      echo "why=the pull request comes from a fork: agents work only on branches of this repository"
      return
    fi
    branch=$(jq -r .headRefName <<<"$view")
    issue=$(jq -r '.closingIssuesReferences[0].number // empty' <<<"$view")
  else
    issue=$NUMBER
    local open
    open=$(gh pr list --state open --limit 200 --json number,headRefName,closingIssuesReferences \
      --jq "map(select(any(.closingIssuesReferences[]; .number == $issue)))[0] // empty | \"\(.number) \(.headRefName)\"")
    [ -n "$open" ] && read -r pr branch <<<"$open"
  fi
  if [ -z "$issue" ]; then
    echo "why=the pull request closes no issue, so no agent owns it"
    return
  fi
  labels=$(gh issue view "$issue" --json labels --jq '.labels[].name')
  if [ -z "$label" ]; then
    label=$(roles <<<"$labels")
    if [ -z "$label" ]; then
      echo "why=issue #$issue has no agent:<role> label, so no agent owns it"
      return
    fi
    if [ "$(wc -l <<<"$label")" -gt 1 ]; then
      echo "why=issue #$issue has more than one agent label ($(tr '\n' ' ' <<<"$label")): keep the one that owns it"
      return
    fi
  fi
  runner=$(grep '^runner:' <<<"$labels" | head -1 || true)
  runner=${runner#runner:}
  if [ -z "$runner" ]; then
    runner=$(jq -r --arg l "$label" '.[$l] // empty' <<<"${RUNNERS:-}" 2>/dev/null || true)
    runner=${runner:-${DEFAULT_RUNNER:?}}
    if [ "${RECORD_RUNNER:-}" = 1 ]; then
      gh label create "runner:$runner" --description "The tool of the agent that owns this task" --color c5def5 --force >/dev/null
      gh issue edit "$issue" --add-label "runner:$runner" >/dev/null
    fi
  fi
  request=false
  grep -qx request <<<"$labels" && request=true
  printf 'label=%s\nrole=%s\nrunner=%s\nissue=%s\npr=%s\nbranch=%s\nmode=%s\nrequest=%s\n' \
    "$label" "${label#agent:}" "$runner" "$issue" "$pr" "$branch" "$mode" "$request"
}

gitlab() {
  local harness=$1 labels label runner
  if [ -z "${TASK_ID:-}" ]; then
    echo "agent-owner: no TASK_ID, the owner of the task is not checked" >&2
    printf '%s\n' "${AI_FLOW_ROLE:-}"
    return
  fi
  labels=$(glab issue view "$TASK_ID" --output json | jq -r '.labels[]')
  label=$(roles <<<"$labels" | head -1)
  runner=$(grep '^runner:' <<<"$labels" | head -1 || true)
  runner=${runner#runner:}
  if [ -n "$runner" ] && [ "$runner" != "$harness" ]; then
    echo "Task #$TASK_ID belongs to $runner (label runner:$runner): run the pipeline with AI_FLOW_HARNESS=$runner," >&2
    echo "or remove the label to move the task to $harness." >&2
    exit 1
  fi
  if [ -n "$label" ] && [ -n "${AI_FLOW_ROLE:-}" ] && [ "agent:$AI_FLOW_ROLE" != "$label" ]; then
    echo "Task #$TASK_ID belongs to the ${label#agent:} agent (label $label), not to $AI_FLOW_ROLE." >&2
    exit 1
  fi
  [ -z "$runner" ] && glab issue update "$TASK_ID" --label "runner:$harness" >/dev/null
  printf '%s\n' "${AI_FLOW_ROLE:-${label#agent:}}"
}

case "${1:-}" in
  github) github ;;
  gitlab) gitlab "${2:?usage: agent-owner.sh gitlab HARNESS}" ;;
  *) echo "usage: agent-owner.sh github | gitlab HARNESS" >&2; exit 2 ;;
esac
