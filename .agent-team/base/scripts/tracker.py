#!/usr/bin/env python3
"""Check the issue tracker configuration, read-only.

  python3 scripts/tracker.py check     which tracker and starter, authentication,
                                       what can be read (nothing is written)
  python3 scripts/tracker.py config    the effective configuration (secrets are
                                       never stored there: they come from the environment)
  python3 scripts/tracker.py list      the open issues as the scripts see them:
                                       role, milestone, dependencies, started or not
  python3 scripts/tracker.py show N    one issue: text, comments, sub-issues, blockers

Configuration: .agent-team/config.json (see scripts/agentteam/config.py).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agentteam import config, core  # noqa: E402


def main(argv):
    cmd = argv[0] if argv else "check"
    cfg = config.load()
    if cmd == "config":
        print(json.dumps(dict(cfg, tracker_detected=config.detect(cfg)), indent=2))
        return 0
    try:
        trk = config.tracker(cfg)
        st = config.starter(cfg, trk)
    except core.TrackerError as e:
        print(f"FAIL  {e}")
        return 1
    if cmd == "show":
        if len(argv) < 2:
            print("usage: tracker.py show <issue>")
            return 2
        try:
            i = trk.get(argv[1])
        except core.TrackerError as e:
            print(f"FAIL  {e}")
            return 1
        state = "open" if i.open else ("done" if i.done else "closed, not completed")
        print(f"{i.id}  {i.title}\n{state} | milestone: {i.milestone or '-'} | labels: {', '.join(i.labels) or '-'}"
              f" | parent: {i.parent or '-'}\n{i.url}\n\n{i.body}\n")
        for label, fetch in (("Sub-issues", lambda: trk.children(i)), ("Blocked by", lambda: trk.blockers(i)),
                             ("Comments", lambda: trk.comments(i))):
            try:
                rows = fetch()
            except core.Unsupported:
                continue
            print(f"## {label} ({len(rows)})")
            for r in rows:
                if isinstance(r, core.Issue):
                    print(f"- {r.id} [{'open' if r.open else 'closed'}] {r.title}")
                elif isinstance(r, core.Comment):
                    print(f"--- {r.author}{' (bot)' if r.bot else ''}\n{r.body}\n")
                else:
                    print(f"- {r}")
        return 0
    if cmd == "list":
        for i in trk.issues():
            if i.open:
                refs, loose = core.deps_of(i)
                print(f"{i.id:>10}  {core.role_of(i) or '-':9} {('started' if core.started(i) else ''):8} "
                      f"{core.code(i.milestone) or '-':5} deps={','.join(refs + loose) or '-':12} {i.title}")
        return 0
    ok = True
    print(f"tracker: {trk.name}   starter: {st.name}")
    try:
        for good, msg in trk.check():
            ok &= good
            print(("ok    " if good else "WARN  ") + msg)
    except core.TrackerError as e:
        print(f"FAIL  {e}")
        return 1
    if st.name == "command":
        print(f"ok    start_command: {cfg.get('start_command')}")
    if trk.name != "github" and st.name == "label":
        print("WARN  starter 'label' only marks tasks on this tracker: nothing runs them. "
              "Set \"starter\": \"command\" with start_command, or \"print\".")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
