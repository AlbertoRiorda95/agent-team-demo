#!/usr/bin/env python3
"""Create the milestones and task issues of the roadmap and the ready specs.

Works with any tracker of scripts/agentteam (GitHub, GitLab, local files, Jira,
Linear, Redmine; see .agent-team/config.json and `python3 scripts/tracker.py check`).

The roadmap in docs/design/project.md drives the structure:
  - one milestone per roadmap row ("M0 · ...", "M1 · ..."): a native milestone
    (GitHub/GitLab milestone, Jira/Redmine version, Linear project milestone);
  - in it, for every feature of that milestone:
      * the tasks of its spec, if the spec is ready (one issue per row of the
        "Task breakdown", or one agent:team issue for all of them with --team);
      * otherwise one "Design: <feature>" issue (design happens with you).
Specs that no milestone covers get their task issues without a milestone.
Sub-issues are left for scripts/split-issue.py: the parts of one task.

A spec covers roadmap features in two ways: its file name matches the feature
(docs/design/task-board.md <-> "Task board"), or its front matter lists them:
    milestone: M0
    features: Walking skeleton, CI

An optional fifth column "Issue" in the Task breakdown marks rows that need no
new issue: "#12" or "PROJ-12" (already tracked; it gets the milestone if it has
none) or "done". Leave it empty, or "-", for rows to create.

Every created issue carries a key (spec and row), so it is recognized again even
if its title changes. Dependencies are written in the text ("Depends on") and,
where the tracker has them, as native "blocked by" relations.

Every task issue carries a fingerprint of its spec row. When the row changes
(for example in the review of the design merge request), the issue is rewritten
from it if its task has not started; a started one is only listed.

When a feature that has a "Design:" issue gets a ready spec, that issue is
reused instead of left behind: with one task in the breakdown it is renamed and
rewritten as that task; with several it becomes the feature issue ("<Spec> (M1)")
and the tasks are created as its sub-issues.

Issues get no labels: a task starts when you add agent:<role>, or with
scripts/dispatch.py. The script never closes issues; it changes existing ones
only to give a milestone to those that have none and to turn "Design:" issues
into the feature or the task, as above.

Usage:
  python3 scripts/create-issues.py --dry-run      # show the plan
  python3 scripts/create-issues.py                # create what is missing
  python3 scripts/create-issues.py --team         # one agent:team issue per ready spec
  python3 scripts/create-issues.py --migrate      # GitHub/GitLab: from the old "M0 · ..." parent issues

Exit code 2 when the tracker cannot be reached or is not configured.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agentteam import config, core, specs  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--team", action="store_true")
    ap.add_argument("--migrate", action="store_true")
    ap.add_argument("--tracker", "--platform", dest="tracker", choices=config.TRACKERS)
    a = ap.parse_args()

    try:
        trk = config.tracker(config.load(), a.tracker)
    except core.TrackerError as e:
        print(f"Tracker not available: {e}", file=sys.stderr)
        return 2
    try:
        existing = trk.issues()
        try:
            milestones = trk.milestones()
            has_ms = True
        except core.Unsupported as e:
            print(f"({trk.name}: {e}; issues are created without a milestone)")
            milestones, has_ms = {}, False
    except (core.TrackerError, FileNotFoundError) as e:
        if not a.dry_run:
            print(f"Cannot read the issues ({trk.name}): {e}", file=sys.stderr)
            return 2
        print(f"(dry run: {trk.name} not reachable, existing issues and milestones not checked: {e})")
        existing, milestones, has_ms = [], {}, True

    by_key = {core.key_of(i): i for i in existing if core.key_of(i)}
    by_title = {i.title: i for i in existing}
    by_id = {}
    for i in existing:
        by_id[i.ref] = by_id[i.number] = i

    groups = specs.build_plan(a.team, trk)
    if not groups and not a.migrate:
        print("Nothing to do: no roadmap in docs/design/project.md and no ready spec with a Task breakdown.")
        return 0
    issues, planned, done = {}, set(), set()
    count = {"issues": 0, "milestones": 0, "assigned": 0, "deps": 0, "detached": 0, "renamed": 0, "updated": 0}
    changed_started = []

    def ensure_ms(ms_code, title, description):
        if not has_ms:
            return None, None
        if ms_code in milestones:
            ref, t = milestones[ms_code]
            print(f"milestone exists   {t}" if ref is not None else f"milestone planned  {t}")
            return ref, t
        if a.dry_run:
            print(f"milestone create   {title}")
            milestones[ms_code] = (None, title)
            return None, title
        ref = trk.create_milestone(title, description)
        milestones[ms_code] = (ref, title)
        count["milestones"] += 1
        print(f"milestone created  {title}")
        return ref, title

    def assign(issue, ms_ref, ms_title, indent):
        if not ms_title or issue.milestone:
            return
        if a.dry_run:
            print(f"{indent}    -> gets milestone {ms_title}")
            return
        trk.set_milestone(issue, ms_ref)
        issue.milestone = ms_title
        count["assigned"] += 1
        print(f"{indent}    -> milestone {ms_title}")

    def find_existing(t):
        i = by_key.get(t["key"]) or by_title.get(t["title"])
        if not i and t.get("legacy"):
            pre, mid = t["legacy"]
            i = next((x for x in existing if x.title.startswith(pre) and mid in x.title
                      and core.MARK_CREATED in x.body), None)
        return i

    def design_issue(t):
        """The open "Design:" issue this entry reuses, if any."""
        for dkey, titles in t.get("adopt", []):
            i = by_key.get(dkey) or next((by_title[x] for x in titles if x in by_title
                                          and core.MARK_CREATED in by_title[x].body), None)
            if i is not None and i.open and id(i) not in {id(x) for x in issues.values()}:
                return i
        return None

    def adopt(i, t, body, indent):
        if a.dry_run:
            print(f"{indent}rename  {i.id}  {i.title}  ->  {t['title']}")
        else:
            trk.edit_issue(i, t["title"], body)
            count["renamed"] += 1
            print(f"{indent}renamed {i.id}  {t['title']}")
        i.title, i.body = t["title"], body
        issues[t["key"]] = i

    def ensure(t, ms_ref, ms_title, indent=""):
        key = t["key"]
        if t.get("kind") == "feature":
            planned.add(key)
            i = by_key.get(key)
            if i is not None:
                issues[key] = i
                print(f"{indent}exists  {i.id}  {i.title}")
            elif (d := design_issue(t)) is not None:
                adopt(d, t, t["body"], indent)
            return
        if t["ref"] == "done":
            done.add(key)
            print(f"{indent}done          {key}")
            return
        if t["ref"] is not None:
            i = by_id.get(t["ref"])
            if i is None and not a.dry_run:
                i = trk.get(t["ref"])
            print(f"{indent}tracked {t['ref']}  {key}")
            if i is not None:
                issues[key] = i
                assign(i, ms_ref, ms_title, indent)
            return
        planned.add(key)
        i = find_existing(t)
        dep_txt, deps = specs.deps_text(t, lambda d: issues.get(d) or by_key.get(d), done)
        if i is not None:
            issues[key] = i
            assign(i, ms_ref, ms_title, indent)
            want, have = specs.ROW_MARK.search(t["body"]), specs.row_of(i)
            if not (want and i.open and have != want.group(1)):
                print(f"{indent}exists  {i.id}  {i.title}")
            elif core.started(i):
                print(f"{indent}exists  {i.id}  {i.title}" + ("   (spec row changed after the start)" if have else ""))
                if have:
                    changed_started.append(i)
            elif a.dry_run:
                print(f"{indent}update  {i.id}  {t['title']}   (spec row " + ("changed)" if have else "fingerprint added)"))
            else:
                trk.edit_issue(i, t["title"], t["body"].replace("{deps}", dep_txt))
                count["updated"] += 1
                for d in deps:
                    if str(d.ref) not in [str(b) for b in trk.blockers(i)] and trk.add_dependency(i, d):
                        count["deps"] += 1
                print(f"{indent}updated {i.id}  {t['title']}")
            return
        parent = issues.get(t.get("parent"))
        under = f"   (sub-issue of {parent.id})" if parent is not None else ""
        d = design_issue(t)
        if d is not None:
            adopt(d, t, t["body"].replace("{deps}", dep_txt), indent)
            if not a.dry_run:
                for dep in deps:
                    if trk.add_dependency(d, dep):
                        count["deps"] += 1
            return
        if a.dry_run:
            print(f"{indent}create        {t['title']}" + (f"   (depends on: {dep_txt})" if t["deps"] else "") + under)
            return
        i = trk.create_issue(t["title"], t["body"].replace("{deps}", dep_txt), ms_ref, parent=parent)
        i.milestone = ms_title
        issues[key] = i
        count["issues"] += 1
        for d in deps:
            if trk.add_dependency(i, d):
                count["deps"] += 1
        print(f"{indent}created {i.id}  {t['title']}{under}")

    for ms, children in groups:
        ms_ref, ms_title = ensure_ms(*ms) if ms else (None, None)
        for t in children:
            ensure(t, ms_ref, ms_title, indent="    " if ms else "")

    old = sorted((i for i in existing if i.open and core.MARK_CREATED in i.body and i.body.startswith("## Milestone ")),
                 key=lambda i: i.ref)
    if old and not a.migrate:
        print(f"\n{len(old)} milestone issue(s) from the old layout (milestones are now native):")
        for i in old:
            print(f"  {i.id}  {i.title}")
        print("Run python3 scripts/create-issues.py --migrate --dry-run (it moves their tasks, if any, "
              "into the milestones), then close them.")
    if a.migrate:
        print("\nMigration from the old milestone issues:" if old else "\nMigration: no old milestone issues found.")
        in_plan = {ms[0]: ms for ms, _ in groups if ms}
        for p in old:
            c = core.code(p.title)
            ms_ref, ms_title = ensure_ms(*in_plan.get(c, (c, p.title, "Created by scripts/create-issues.py --migrate.")))
            for child in trk.children(p):
                print(f"    {child.id} " + ("would be detached from" if a.dry_run else "detached from") + f" {p.id}")
                assign(child, ms_ref, ms_title, "    ")
                if not a.dry_run:
                    trk.unlink_child(p, child)
                    count["detached"] += 1
        if old:
            print("\nClose these old milestone issues once you have checked the milestones:")
            for p in old:
                print(f"  {p.id}  {p.title}")

    matched = {id(i) for i in issues.values()}
    stale = [i for i in existing if i.open and core.MARK_CREATED in i.body and not i.body.startswith("## Milestone ")
             and id(i) not in matched and core.key_of(i) not in planned]
    if changed_started:
        print("\nStarted before their spec row changed (check the work against the spec, or stop it):")
        for i in changed_started:
            print(f"  {i.id}  {i.title}")
    if stale:
        print("\nCreated by this script but no longer in the plan (close them if obsolete):")
        for i in stale:
            print(f"  {i.id}  {i.title}")
    if not a.dry_run:
        print(f"\n{count['issues']} issue(s) and {count['milestones']} milestone(s) created, "
              f"{count['renamed']} Design: issue(s) turned into features or tasks, "
              f"{count['updated']} updated from their spec row, "
              f"{count['assigned']} issue(s) given a milestone, {count['deps']} native dependencies"
              + (f", {count['detached']} detached from old milestone issues." if a.migrate else "."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
