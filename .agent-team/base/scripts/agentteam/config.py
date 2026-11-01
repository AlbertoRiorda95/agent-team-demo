"""Which tracker and which starter a project uses.

Configuration lives in .agent-team/config.json (yours: the plugin never
overwrites it). Every key is optional; environment variables override it:
AGENT_TEAM_TRACKER, AGENT_TEAM_STARTER, AGENT_TEAM_START_COMMAND.

{
  "tracker": "auto",        auto | github | gitlab | local | jira | linear | redmine
  "starter": "auto",        auto | label | gitlab-pipeline | command | print
  "start_command": "",      for "command", e.g. "orchestrator enqueue --issue {number} --role {role}"
  "local":   {"dir": "docs/tasks"},
  "jira":    {"url": "https://you.atlassian.net", "project": "KEY", "issue_type": "Task",
              "subtask_type": "Subtask"},          auth: JIRA_EMAIL + JIRA_API_TOKEN, or JIRA_PAT
  "linear":  {"team": "ENG", "project": "Name"},   auth: LINEAR_API_KEY
  "redmine": {"url": "https://redmine.example.com", "project": "identifier",
              "started_status": "In Progress", "hold_status": "On hold"}   auth: REDMINE_API_KEY
}

"auto" picks GitHub or GitLab from the CI environment or the Git remote, and
the local tracker when there is no remote; "none" means no issue tracker.

The same file holds the project profile (harnesses, ci, roles, features, runners):
see profile.py. "runners" maps a role to the harness that runs it in CI and from
the starters, e.g. {"frontend": "opencode"}; the other roles use the first harness.
"""
import importlib
import json
import os

from . import core

PATH = os.path.join(".agent-team", "config.json")
DEFAULTS = {"tracker": "auto", "starter": "auto", "start_command": "", "local": {"dir": "docs/tasks"},
            "jira": {}, "linear": {}, "redmine": {}}
TRACKERS = ("github", "gitlab", "local", "jira", "linear", "redmine")


def load(path=PATH):
    cfg = json.loads(json.dumps(DEFAULTS))
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for k, v in data.items():
            if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                cfg[k].update(v)
            else:
                cfg[k] = v
    for env, key in (("AGENT_TEAM_TRACKER", "tracker"), ("AGENT_TEAM_STARTER", "starter"),
                     ("AGENT_TEAM_START_COMMAND", "start_command")):
        if os.environ.get(env):
            cfg[key] = os.environ[env]
    return cfg


def detect(cfg):
    name = cfg.get("tracker", "auto")
    if name == "none":
        raise core.TrackerError('this project has no issue tracker ("tracker": "none" in .agent-team/config.json)')
    if name != "auto":
        if name not in TRACKERS:
            raise core.TrackerError(f"unknown tracker {name!r}: use one of {', '.join(TRACKERS)}")
        return name
    if os.environ.get("GITHUB_ACTIONS"):
        return "github"
    if os.environ.get("GITLAB_CI"):
        return "gitlab"
    url = core.sh(["git", "remote", "get-url", "origin"]).stdout.strip()
    if not url:
        return "local"
    return "github" if "github.com" in url else "gitlab"


def tracker(cfg=None, name=None):
    cfg = cfg or load()
    name = name or detect(cfg)
    try:
        mod = importlib.import_module(f"{__package__}.trackers.{name}")
    except ModuleNotFoundError:
        raise core.TrackerError(f"the {name} adapter is not in this project (scripts/agentteam/trackers/{name}.py): "
                                f"set \"tracker\": \"{name}\" in .agent-team/config.json and run the template "
                                "upgrade to install it")
    return mod.Adapter(cfg)


def starter(cfg, trk):
    from . import starters
    return starters.make(cfg, trk)
