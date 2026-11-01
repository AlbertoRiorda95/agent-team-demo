# Issue trackers and starters

The scripts that create, split and start tasks (`scripts/create-issues.py`,
`scripts/split-issue.py`, `scripts/dispatch.py`) talk to the tracker only
through `scripts/agentteam/core.py`: one interface, one adapter per tracker in
`scripts/agentteam/trackers/`. Python standard library only, nothing to install.

How a task is *started* is kept apart, on purpose: that part depends on your
setup (a label that triggers a workflow, a pipeline, an orchestrator). It is the
*starter*, in `scripts/agentteam/starters.py`.

## Trackers

| Tracker | Milestones | Sub-issues | Dependencies | Labels | Needs |
|---|---|---|---|---|---|
| `github` | milestones | sub-issues | "blocked by" | yes | `gh` authenticated |
| `gitlab` | milestones | linked issues | "blocked by" links (Premium), otherwise text | yes | `glab` authenticated |
| `local` | `docs/tasks/_milestones.json` | `parent` field | text | yes | nothing: Markdown files in `docs/tasks/` |
| `jira` | versions (Fix Version) | sub-tasks | "Blocks" links | yes | `JIRA_EMAIL` + `JIRA_API_TOKEN` (Cloud) or `JIRA_PAT` (Data Center) |
| `linear` | project milestones | sub-issues | "blocks" relations | yes | `LINEAR_API_KEY` |
| `redmine` | versions | parent task | "blocks" relations | no: statuses instead | `REDMINE_API_KEY` |

Dependencies are always written in the issue text too ("Depends on"), so
`dispatch.py` works even where the tracker has no relation for them. On Jira,
Linear and Redmine the hidden markers the scripts use to recognize their issues
are a last plain line `[agent-team] ...` instead of an HTML comment; leave it.

## Starters

| Starter | What it does | Default on |
|---|---|---|
| `label` | adds `agent:<role>`; on GitHub that starts `.github/workflows/agents.yml` | GitHub, with the `ci-agents` feature |
| `gitlab-pipeline` | adds `agent:<role>` and runs the agent pipeline for the issue | GitLab, with the `ci-agents` feature |
| `command` | marks the task, then runs `start_command` with the issue's data | any, when `start_command` is set |
| `print` | marks the task and prints how to start it by hand | the other trackers, and GitHub or GitLab without `ci-agents` (agents run locally) |

`command` is the connector for a custom orchestrator: a queue, a
service, a local `claude -p`. Placeholders: `{number}` (12, PROJ-12), `{id}`
(#12), `{ref}`, `{role}`, `{title}`, `{url}`, `{tracker}`. The command is split
into arguments first and runs without a shell, so an issue title cannot inject
commands. A non-zero exit stops the dispatch.

## Configuration

`.agent-team/config.json`, all keys optional (`"auto"`: GitHub or GitLab from
the CI or the Git remote, `local` without a remote):

```json
{
  "tracker": "jira",
  "starter": "command",
  "start_command": "orchestrator enqueue --issue {number} --role {role}",
  "jira": {"url": "https://example.atlassian.net", "project": "APP"}
}
```

Other sections: `"linear": {"team": "ENG", "project": "App"}` (milestones need
a project), `"redmine": {"url": "...", "project": "identifier", "started_status":
"In Progress", "hold_status": "On hold"}`, `"local": {"dir": "docs/tasks"}`.
Secrets never go in this file: they come from the environment. The variables
`AGENT_TEAM_TRACKER`, `AGENT_TEAM_STARTER` and `AGENT_TEAM_START_COMMAND`
override it.

```bash
python3 scripts/tracker.py check    # tracker, starter, authentication; writes nothing
python3 scripts/tracker.py list     # open issues as the scripts see them
```

## In CI

The workflows in `.github/` and `.gitlab/` are for GitHub and GitLab. With
another tracker the creation and split scripts work the same from your
computer (or `/agent-team:create-issues`, `/agent-team:split-issue`); the split
proposal is approved in the conversation instead of with `@claude ok`, and
tasks start through your starter.

## Adding a tracker

One file in `scripts/agentteam/trackers/` with a class `Adapter(core.Tracker)`:
`issues`, `create_issue` and `check` are required; milestones, sub-issues,
comments, labels and dependencies are optional (raise `core.Unsupported`, the
scripts fall back). Add its name to `TRACKERS` in `config.py`.
