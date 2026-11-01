#!/usr/bin/env python3
"""Split one issue into task issues, one per role.

Works with any tracker of scripts/agentteam (GitHub, GitLab, local files, Jira,
Linear, Redmine).

Two steps, with your approval in between:
  1. propose: the plan (written by Claude or by you) is checked and posted as a
     comment on the issue. Nothing is created.
  2. create: after your approval ("@claude ok" on GitHub, SPLIT_CONFIRM on
     GitLab, or your yes in the conversation), this script creates exactly the
     plan of the latest proposal comment, as sub-issues of the issue in its
     milestone. The model is not involved in this step.

A task can depend on a task of another issue's plan: "depends_on": ["12:api"].
Split issue 12 first; create on this issue refuses while that task does not exist.

Usage:
  python3 scripts/split-issue.py check   <plan.json>
  python3 scripts/split-issue.py propose <issue> <plan.json>
  python3 scripts/split-issue.py create  <issue>

The plan format is described in scripts/agentteam/plans.py. The created issues
get no labels: start each task with agent:<role> or scripts/dispatch.py. Running
create twice creates nothing new (tasks are recognized by their key). Only a
proposal posted by a bot or by you counts, never one pasted by someone else.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agentteam import config, core, plans, specs  # noqa: E402


def load(path, issue_number=None):
    try:
        plan = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"Cannot read {path}: {e}", file=sys.stderr)
        return None
    err = plans.validate(plan, issue_number)
    if err:
        print("The plan has problems, fix them and run again:\n- " + "\n- ".join(err), file=sys.stderr)
        return None
    return plan


def latest_plan(trk, issue):
    found = None
    for c in trk.comments(issue):
        if (c.bot or c.mine) and plans.START in c.body:
            found = c.body
    return found


def keyed_children(trk, issue):
    """{key: child} of the task issues already created for an issue."""
    found = {}
    for child in trk.children(issue):
        m = re.search(r"split-of: (\S+) key: ([a-z0-9-]+)", child.body)
        if m:
            found[m.group(2)] = child
    return found


def resolve_external(trk, issue, tasks, done):
    """{"12:api": issue} for the cross-issue dependencies of the tasks still to create."""
    found, missing = {}, []
    for t in tasks:
        if t["key"] in done:
            continue
        for d in t.get("depends_on", []):
            x = plans.cross_ref(d)
            if not x or d in found:
                continue
            try:
                child = keyed_children(trk, trk.get(x[0].lstrip("#"))).get(x[1])
            except core.TrackerError:
                child = None
            if child:
                found[d] = child
            elif d not in missing:
                missing.append(d)
    if missing:
        sys.exit(f'{issue.id} depends on {", ".join(missing)}, which do not exist yet: '
                 f"split and create the issue each one belongs to first. Nothing was created.")
    return found


def create(trk, issue):
    body = latest_plan(trk, issue)
    plan = plans.parse(body) if body else None
    if not plan or plans.validate(plan, issue.number):
        sys.exit(f"No valid proposal on {issue.id}: propose a split first.")
    approver = os.environ.get("SPLIT_APPROVER", "")
    by = f" (approved by @{approver})" if approver else ""
    done = {}
    try:
        done = keyed_children(trk, issue)
    except core.Unsupported:
        pass
    ms_ref = None
    if issue.milestone:
        try:
            ms_ref = next((r for r, t in trk.milestones().values() if t == issue.milestone), None)
        except core.Unsupported:
            pass
    short = issue.title if len(issue.title) <= 60 else issue.title[:57].rstrip() + "..."
    spec = f"\n\nSpec: `{plan['spec']}`" if plan.get("spec") else ""
    tasks, made, notes = plan["tasks"], [], []
    external = resolve_external(trk, issue, tasks, done)

    def new(title, body, key):
        child = trk.create_issue(title, body + "\n\n" + trk.marker(f"split-of: {issue.id} key: {key}"), ms_ref, parent=issue)
        done[key] = child
        made.append(child)
        print(f"created {child.id}  {title}")
        return child

    for i, t in enumerate(tasks, 1):
        if t["key"] in done:
            print(f"exists  {done[t['key']].id}  {t['title']}")
            continue
        deps = [external[d] if d in external else done[d] for d in t.get("depends_on", [])
                if d in external or d in done]
        acc = "\n".join(f"- [ ] {a}" for a in t["acceptance"])
        files = "\n".join(f"- `{f}`" for f in t.get("files", [])) or "-"
        child = new(f"{short} · {i}/{len(tasks)} · {t['role']}: {t['title']}"[:250],
                    f"## Parent\n{issue.id}{by}{spec}\n\n## Task\n{t['task']}\n\n## Acceptance criteria\n{acc}\n\n"
                    f"## Files\n{files}\n\n## Depends on\n{', '.join(d.id for d in deps) or 'none'}\n\n"
                    f"{specs.start_line(trk, t['role'])}", t["key"])
        for d in deps:
            if not trk.add_dependency(child, d):
                notes.append(f"{child.id} depends on {d.id}: written in the issue, not as a native relation")
    try:
        trk.remove_label(issue, plans.LABEL)
    except core.Unsupported:
        pass
    if made:
        lst = "\n".join(f"- {c.id} ({core.role_of(c)})" for c in made)
        msg = (f"Created {len(made)} issue(s) from the approved split{by}:\n\n{lst}\n\n"
               f"Start with {made[0].id}: `agent:{core.role_of(made[0])}`, or scripts/dispatch.py. "
               f"No labels were added.")
        if notes:
            msg += "\n\n" + "\n".join(f"- {x}" for x in notes)
        trk.comment(issue, msg)
    print(f"{len(made)} issue(s) created.")


def main(argv):
    if len(argv) >= 2 and argv[0] == "check":
        return 0 if load(argv[1]) else 1
    if len(argv) >= 2 and argv[0] in ("propose", "create"):
        trk = config.tracker(config.load())
        issue = trk.get(argv[1].lstrip("#"))
        if argv[0] == "propose":
            if len(argv) < 3:
                print(__doc__)
                return 2
            plan = load(argv[2], issue.number)
            if not plan:
                return 1
            trk.comment(issue, plans.render(plan, trk, issue.id))
            print(f"Proposal posted on {issue.id}.")
            return 0
        create(trk, issue)
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except core.TrackerError as e:
        sys.exit(f"Tracker error: {e}")
