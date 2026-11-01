#!/usr/bin/env python3
"""The project profile: which harnesses, CI, tracker, roles and features this
project uses (.agent-team/config.json, see scripts/agentteam/profile.py), and
removal of the template files and sections it does not use.

  python3 scripts/agent-team.py profile            the profile and what is out of it
  python3 scripts/agent-team.py prune --dry-run    what prune would remove
  python3 scripts/agent-team.py prune              remove it

prune only touches template files: those recorded in .agent-team/manifest.json,
or, in a fresh copy of the template without a manifest, every file the
components map knows (then it asks for --yes). A recorded file you changed is
kept and listed: delete it yourself if you do not need it. Sections of
unused features are removed from the files that remain (AGENTS.md, workflows).

Nothing is lost for good: to bring something back, change the profile and run
the template upgrade (/agent-team:upgrade, or the plugin's template_sync.py),
which installs what the new profile includes.
"""
import argparse
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agentteam import config, profile  # noqa: E402

STATE = ".agent-team"


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def manifest():
    p = os.path.join(STATE, "manifest.json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None


def plan(cfg):
    active, lead = profile.tags(cfg)
    comps = profile.Components.load(".")
    m = manifest()
    known = set((m or {}).get("files", {})) if m else None
    delete, keep_changed, rerender = [], [], []
    for rel in profile.walk("."):
        if known is not None and rel not in known:
            continue
        if not comps.wanted(rel, active):
            base = os.path.join(STATE, "base", rel)
            if known is None or (os.path.exists(base) and sha(base) == sha(rel)):
                delete.append(rel)
            else:
                keep_changed.append(rel)
            continue
        if profile.is_text(rel):
            text = open(rel, encoding="utf-8").read()
            new = profile.render_text(rel, text, active, lead, comps)
            if new != text:
                rerender.append((rel, new))
    return delete, keep_changed, rerender, m


def prune_dirs(path):
    d = os.path.dirname(path)
    while d and d != "." and os.path.isdir(d) and not os.listdir(d):
        os.rmdir(d)
        d = os.path.dirname(d)


def cmd_profile(cfg):
    print(profile.describe(cfg))
    delete, keep_changed, rerender, m = plan(cfg)
    print(f"\nOut of the profile: {len(delete)} file(s) to remove, {len(keep_changed)} changed by you, "
          f"{len(rerender)} file(s) with sections to remove. `prune --dry-run` lists them.")
    if m is None:
        print("No .agent-team/manifest.json: this looks like a plain copy of the template.")
    return 0


def cmd_prune(cfg, dry, yes):
    delete, keep_changed, rerender, m = plan(cfg)
    print(profile.describe(cfg))
    for rel in delete:
        print(f"remove   {rel}")
    for rel, _ in rerender:
        print(f"sections {rel}")
    for rel in keep_changed:
        print(f"keep     {rel}  (out of the profile but changed by you: delete it yourself if not needed)")
    if not (delete or rerender):
        print("Nothing to prune.")
        return 0
    if dry:
        print("\n(dry run: nothing changed)")
        return 0
    if m is None and not yes:
        print("\nNo manifest: run again with --yes to confirm that this is a fresh copy of the template.")
        return 2
    active, lead = profile.tags(cfg)
    comps = profile.Components.load(".")
    for rel in delete:
        os.remove(rel)
        prune_dirs(rel)
        if m is not None:
            m["files"].pop(rel, None)
            base = os.path.join(STATE, "base", rel)
            if os.path.exists(base):
                os.remove(base)
                prune_dirs(base)
    for rel, new in rerender:
        open(rel, "w", encoding="utf-8").write(new)
        base = os.path.join(STATE, "base", rel)
        if m is not None and os.path.exists(base):
            text = open(base, encoding="utf-8").read()
            open(base, "w", encoding="utf-8").write(profile.render_text(rel, text, active, lead, comps))
            m["files"][rel] = sha(base)
    if m is not None:
        with open(os.path.join(STATE, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(m, f, indent=2, sort_keys=True)
            f.write("\n")
    print(f"\nRemoved {len(delete)} file(s), updated {len(rerender)}.")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("profile")
    p = sub.add_parser("prune")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--yes", action="store_true")
    a = ap.parse_args(argv)
    cfg = config.load()
    try:
        if a.cmd == "profile":
            return cmd_profile(cfg)
        return cmd_prune(cfg, a.dry_run, a.yes)
    except profile.ProfileError as e:
        print(f"Profile error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
