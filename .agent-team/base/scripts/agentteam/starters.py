"""How a task is started. This part is specific to each setup, on purpose:

  label            adds agent:<role>. On GitHub that starts agents.yml; on other
                   trackers it only marks the task as running.
  gitlab-pipeline  adds agent:<role> and runs the agent pipeline for the issue.
  command          marks the task as running, then runs start_command from the
                   configuration: the connector to an orchestrator (custom scenario),
                   a queue, a local `claude -p`, anything with a command line.
  print            marks the task as running and prints how to start it by hand.

"auto": label on GitHub, gitlab-pipeline on GitLab, command when start_command is
set, print otherwise.

start_command placeholders: {number} (12, PROJ-12), {id} (#12), {ref}, {role},
{title}, {url}, {tracker}, {harness} (claude, opencode or codex: "runners" in the
configuration for that role, otherwise the first harness of the profile). The command is split into arguments before the
placeholders are filled, and runs without a shell, so a title cannot inject
commands.
"""
import shlex
import subprocess

from . import core


class Starter:
    name = "base"

    def __init__(self, cfg, tracker):
        self.cfg, self.tracker = cfg, tracker

    def harness(self, role):
        """Which harness runs this role: "runners" in the configuration, else the lead."""
        runners = self.cfg.get("runners") or {}
        if runners.get(role):
            return runners[role]
        harnesses = self.cfg.get("harnesses") or ["claude"]
        return harnesses[0] if isinstance(harnesses, list) else str(harnesses).split(",")[0].strip()

    def mark(self, issue, role):
        try:
            self.tracker.add_label(issue, f"agent:{role}")
        except core.Unsupported:
            pass

    def start(self, issue, role):
        raise NotImplementedError


class Label(Starter):
    name = "label"

    def start(self, issue, role):
        self.tracker.add_label(issue, f"agent:{role}")
        return f"labeled agent:{role}"


class GitLabPipeline(Starter):
    name = "gitlab-pipeline"

    def start(self, issue, role):
        self.mark(issue, role)
        variables = {"TASK_ID": issue.number,
                     "AI_FLOW_INPUT": f"You are the {role} agent. Carry out issue {issue.id} ({issue.title}): "
                                      f"read it with glab issue view {issue.number} and follow "
                                      f"docs/roles/{role}.md and AGENTS.md.",
                     "AI_FLOW_ROLE": role, "AI_FLOW_HARNESS": self.harness(role)}
        self.tracker.run_pipeline(variables)
        return "pipeline started"


class Command(Starter):
    name = "command"

    def start(self, issue, role):
        template = self.cfg.get("start_command") or ""
        if not template:
            raise core.TrackerError("starter 'command' needs start_command in .agent-team/config.json")
        values = {"number": issue.number, "id": issue.id, "ref": issue.ref, "role": role,
                  "title": issue.title, "url": issue.url, "tracker": self.tracker.name,
                  "harness": self.harness(role)}
        args = [a.format_map(values) for a in shlex.split(template)]
        self.mark(issue, role)
        p = subprocess.run(args, capture_output=True, text=True)
        if p.returncode:
            raise core.TrackerError(f"start_command failed ({p.returncode}): {p.stderr.strip() or p.stdout.strip()}")
        return f"ran {args[0]}"


class Print(Starter):
    name = "print"

    def start(self, issue, role):
        self.mark(issue, role)
        return (f"start it yourself: in a session, delegate to @{role} with \"carry out {issue.id}\""
                + (f" ({issue.url})" if issue.url else ""))


KINDS = {c.name: c for c in (Label, GitLabPipeline, Command, Print)}


def make(cfg, tracker):
    name = cfg.get("starter", "auto")
    in_ci = "ci-agents" in cfg.get("features", ["ci-agents"])   # no "features": the full template
    if name == "auto":
        if tracker.name == "github" and in_ci:
            name = "label"
        elif tracker.name == "gitlab" and in_ci:
            name = "gitlab-pipeline"
        elif cfg.get("start_command"):
            name = "command"
        else:
            name = "print"
    if name not in KINDS:
        raise core.TrackerError(f"unknown starter {name!r}: use one of {', '.join(KINDS)}")
    return KINDS[name](cfg, tracker)
