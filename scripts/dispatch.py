#!/usr/bin/env python3
"""Start the task issues that are ready: no open dependency, a free slot for the role.

The tracker part works with any tracker of scripts/agentteam; how a task is
started is the starter, chosen in .agent-team/config.json (see
scripts/agentteam/starters.py): the agent:<role> label on GitHub, the agent
pipeline on GitLab, a command of yours (for example an orchestrator), or a
printed instruction.

  1. Scope: the first open milestone (M0, M1, ...) that still has open task
     issues, the one given with --milestone, or all of them with --all.
  2. Running: open issues already marked agent:<role>. A slot frees when the
     issue closes, that is when its work is merged.
  3. Check each task against its spec on the main branch (origin's default
     branch after a fetch; the current commit without a remote). It waits while
     the spec is not merged there (issues can be created from a design branch
     before its merge) or its row was removed. If its row changed since the
     issue was written, the issue is rewritten from it (shown, with --apply
     done) and judged on its new dependencies.
  4. Start, in issue order, the tasks whose dependencies ("Depends on" in the
     text, and the tracker's native "blocked by") are all closed as completed,
     at most --per-role per role and --max in total, running ones included.

Open "Design:" issues and issues without a role are not tasks: the plan lists
how many are open up to the scope's milestone, with the command that turns them
into tasks, so a milestone without tasks yet is never skipped silently.

It never starts optimizer or security (on-demand roles), issues marked `hold`,
"Design:" issues, or issues without a role. Without --apply it only prints the
plan.

Usage:
  python3 scripts/dispatch.py                       # the plan, changing nothing
  python3 scripts/dispatch.py --apply               # start what the plan says
  python3 scripts/dispatch.py --per-role 2 --max 4  # more parallelism
  python3 scripts/dispatch.py --milestone M1 | --all
"""
import argparse
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agentteam import config, core, specs  # noqa: E402


def git(*args, timeout=30):
    try:
        p = subprocess.run(["git", *args], capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return p.stdout if p.returncode == 0 else None


def main_ref():
    """The branch the agents start from: origin's default branch, else the current commit; None outside Git."""
    if git("rev-parse", "--is-inside-work-tree") is None:
        return None
    if git("remote", "get-url", "origin") is None:
        return "HEAD"
    if not (os.environ.get("GITHUB_ACTIONS") or os.environ.get("GITLAB_CI")):
        git("fetch", "--quiet", "origin")                        # a merge done on the platform counts at once
    head = (git("symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD") or "").strip()
    for ref in filter(None, (head, "origin/main", "origin/master")):
        if git("rev-parse", "--verify", "--quiet", ref) is not None:
            return ref
    return "HEAD"


class SpecCheck:
    """Compares each task with its spec row on the main branch.

    check(issue, issue_of) returns why the task must wait, or None. A task whose
    row changed (or has no fingerprint yet) is queued in .updates, rewritten in
    place, and then judged on its new dependencies.
    """

    def __init__(self, trk):
        self.trk, self.ref, self.texts, self.updates = trk, main_ref(), {}, []

    def check(self, issue, issue_of):
        if self.ref is None:
            return None
        m = re.match(r"(docs/design/[^#\s]+\.md)#", core.key_of(issue) or "")
        if not m:
            return None
        path = m.group(1)
        if path not in self.texts:
            self.texts[path] = git("show", f"{self.ref}:{path}")
        text = self.texts[path]
        if text is None or specs.front(text).get("ready") != "yes":
            return f"spec {path} not merged into {self.ref} yet"
        task, done = specs.task_now(path, text, core.key_of(issue), self.trk)
        if task is None:
            return f"its row is no longer in {path} on {self.ref}: close it if obsolete"
        if specs.row_of(issue) == specs.ROW_MARK.search(task["body"]).group(1):
            return None
        deps_txt, deps = specs.deps_text(task, issue_of, done)
        issue.title, issue.body = task["title"], task["body"].replace("{deps}", deps_txt)
        self.updates.append((issue, deps))
        return None


def plan(issues, trk, per_role, max_total, milestone=None, all_ms=False, specs_now=None):
    index, by_key = {}, {}
    for i in issues:
        index[i.ref] = index[i.number] = i
        if core.key_of(i):
            by_key[core.key_of(i)] = i
    tasks = [i for i in issues if i.open and core.role_of(i) and not i.title.startswith("Design:")]
    if milestone:
        scope, label = [i for i in tasks if core.code(i.milestone) == milestone], f"milestone {milestone}"
    elif all_ms:
        scope, label = tasks, "all milestones"
    else:
        with_ms = sorted({i.milestone for i in tasks if i.milestone}, key=core.ms_key)
        first = with_ms[0] if with_ms else None
        scope = [i for i in tasks if i.milestone == first]
        label = f"milestone {first}" if first else "issues without a milestone" if scope else "no task issues"
    running = [i for i in issues if i.open and core.started(i)]
    # slots per role, and per service in a monorepo ("[orders]" tasks): a task
    # without a service may touch any, so it shares the slot with all of them
    busy = {}
    for i in running:
        r = core.role_of(i) or next(l[6:] for l in i.labels if l.startswith("agent:"))
        busy[(r, core.service_of(i))] = busy.get((r, core.service_of(i)), 0) + 1

    def taken(role, svc):
        if svc is None:
            return max([n for (r, _), n in busy.items() if r == role] or [0])
        return busy.get((role, svc), 0) + busy.get((role, None), 0)
    total = len(running)
    start, waiting, skipped = [], [], []
    for i in scope:
        if core.started(i):
            continue
        role = core.role_of(i)
        if core.HOLD in i.labels:
            skipped.append((i, "on hold"))
            continue
        if role in core.ON_DEMAND:
            skipped.append((i, f"{role} runs only when you ask for it"))
            continue
        why = specs_now.check(i, by_key.get) if specs_now else None
        if why:
            waiting.append((i, why))
            continue
        refs, loose = core.deps_of(i)
        refs = list(dict.fromkeys(refs + [str(b) for b in trk.blockers(i)]))
        open_deps = [r for r in refs if not (index.get(r) and index[r].done)]
        if open_deps or loose:
            why = ", ".join((index[r].id if r in index else f"{r} (not found)") for r in open_deps)
            why = ", ".join(x for x in (why, ", ".join(loose)) if x)
            waiting.append((i, f"waits for {why}"))
            continue
        svc = core.service_of(i)
        if taken(role, svc) >= per_role:
            where = f" for {svc}" if svc else ""
            waiting.append((i, f"ready, but a {role} task{where} is already running"))
            continue
        if total >= max_total:
            waiting.append((i, f"ready, but {max_total} tasks are already running or starting"))
            continue
        start.append((i, role))
        busy[(role, svc)] = busy.get((role, svc), 0) + 1
        total += 1
    return label, running, start, waiting, skipped


def not_tasks(issues, label):
    """Hints for the open issues that are not tasks yet, up to the milestone in scope."""
    limit = core.ms_key(label[len("milestone "):]) if label.startswith("milestone ") else None
    design, plain = {}, {}
    for i in issues:
        if not i.open or core.started(i) or (limit and i.milestone and core.ms_key(i.milestone) > limit):
            continue
        ms = core.code(i.milestone) or "no milestone"
        if i.title.startswith("Design:"):
            design[ms] = design.get(ms, 0) + 1
        elif not core.role_of(i) and not (core.key_of(i) or "").endswith("#feature"):   # a feature: its sub-issues are the tasks
            plain[ms] = plain.get(ms, 0) + 1
    order = lambda d: ", ".join(f"{m} ({n})" for m, n in sorted(d.items(), key=lambda x: core.ms_key(x[0])))  # noqa: E731
    out = []
    if design:
        out.append(f"  Design: issues to design first: {order(design)}. "
                   f"Run /agent-team:design-studio <feature>, then /agent-team:create-issues.")
    if plain:
        out.append(f"  Issues without a role: {order(plain)}. Split them with /agent-team:split-issue <n>.")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--per-role", type=int, default=1)
    ap.add_argument("--max", type=int, default=3)
    ap.add_argument("--tracker", choices=config.TRACKERS)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--milestone")
    g.add_argument("--all", action="store_true")
    a = ap.parse_args()

    cfg = config.load()
    trk = config.tracker(cfg, a.tracker)
    st = config.starter(cfg, trk)
    issues = sorted(trk.issues(), key=lambda i: (len(i.number), i.number))
    now = SpecCheck(trk)
    label, running, start, waiting, skipped = plan(issues, trk, a.per_role, a.max, a.milestone, a.all, now)
    lines = [f"Tracker: {trk.name}. Starter: {st.name}. Scope: {label}. "
             f"Limits: {a.per_role} per role, {a.max} in total."]
    lines.append(f"\nRunning ({len(running)}):" if running else "\nRunning: none.")
    lines += [f"  {i.id}  {i.title}" for i in running]
    if now.updates:
        lines.append(f"\n{'Updating' if a.apply else 'Would update'} from the spec on {now.ref} ({len(now.updates)}):")
        lines += [f"  {i.id}  {i.title}" for i, _ in now.updates]
    lines.append(f"\n{'Starting' if a.apply else 'Would start'} ({len(start)}):" if start else "\nNothing to start.")
    lines += [f"  {i.id}  agent:{r}  {i.title}" for i, r in start]
    if waiting:
        lines.append(f"\nWaiting ({len(waiting)}):")
        lines += [f"  {i.id}  {i.title}  - {why}" for i, why in waiting]
    if skipped:
        lines.append(f"\nNot started automatically ({len(skipped)}):")
        lines += [f"  {i.id}  {i.title}  - {why}" for i, why in skipped]
    hints = [] if a.milestone or a.all else not_tasks(issues, label)
    if hints:
        lines.append("\nNot tasks yet:")
        lines += hints
    text = "\n".join(lines)
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write("### Dispatch\n\n```\n" + text + "\n```\n")
    if not a.apply:
        return 0
    failed = 0
    for i, deps in now.updates:
        try:
            trk.edit_issue(i, i.title, i.body)
            have = [str(b) for b in trk.blockers(i)]
            for d in deps:
                if str(d.ref) not in have:
                    trk.add_dependency(i, d)
        except core.TrackerError as e:
            failed += 1
            print(f"could not update {i.id}: {e}", file=sys.stderr)
    for i, role in start:
        try:
            print(f"{i.id}: {st.start(i, role)}")
        except core.TrackerError as e:
            failed += 1
            print(f"could not start {i.id}: {e}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except core.TrackerError as e:
        sys.exit(f"Tracker error: {e}")
