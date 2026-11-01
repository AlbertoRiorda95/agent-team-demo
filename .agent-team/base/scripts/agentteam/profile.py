"""The project profile: which harnesses, CI, tracker, roles and features a project
uses, and which template files and sections belong to them.

The profile is part of .agent-team/config.json (all keys optional; a missing key
means "everything", which is how the full template looks):

  "harnesses": ["claude", "codex"],   claude | opencode | codex; the first one leads
  "ci": "github",                     github | gitlab | both | none
  "tracker": "github",                see config.py; "none" for no issue tracker
  "roles": ["designer", "frontend", "backend", "devops", "optimizer", "security", "writer"],
  "features": ["ci-agents", "team-tasks", "split", "dispatch", "spec-sync", "litellm"]

scripts/agentteam/components.json maps template paths to expressions over tags
(harness_codex, lead_claude, ci_github, tracker_jira, issues, role_security,
team_tasks, ...). A file is installed when its expression is true. Inside a
file, a block between a comment line "agent-team:if <expr>" (after #, <!-- or
//) and a comment line "agent-team:end" is kept only when <expr> is true. JSON files can
drop keys (components.json "json_keys"). claude becomes the
leading harness.

Used by scripts/agent-team.py (prune in the project) and by the plugin's
template_sync.py (install and upgrade from the template, which also restores
what a profile change brings back).
"""
import ast
import fnmatch
import json
import os
import re

COMPONENTS = os.path.join("scripts", "agentteam", "components.json")
HARNESSES = ("claude", "opencode", "codex")
CIS = ("github", "gitlab")
TRACKERS = ("github", "gitlab", "local", "jira", "linear", "redmine")
ROLES = ("designer", "frontend", "backend", "devops", "optimizer", "security", "writer")
FEATURES = ("ci-agents", "team-tasks", "split", "dispatch", "spec-sync", "litellm")
RETIRED = {"guide"}   # features of older templates: accepted and ignored
LEAD = "claude"
BEGIN = re.compile(r"^\s*(?:#|<!--|//)\s*agent-team:if\s+(.+?)\s*(?:-->)?\s*$")
END = re.compile(r"^\s*(?:#|<!--|//)\s*agent-team:end\b")


class ProfileError(ValueError):
    pass


def _list(cfg, key, allowed):
    v = cfg.get(key)
    if v is None:
        return list(allowed)
    if isinstance(v, str):
        v = [x.strip() for x in v.split(",") if x.strip()]
    v = [x for x in v if x not in RETIRED]
    bad = [x for x in v if x not in allowed]
    if bad:
        raise ProfileError(f"{key}: unknown {', '.join(bad)} (use {', '.join(allowed)})")
    return list(v)


def resolve(cfg):
    """The profile as a dict with every key filled in."""
    harnesses = _list(cfg, "harnesses", HARNESSES)
    if not harnesses:
        raise ProfileError("harnesses: at least one of claude, opencode, codex")
    ci = cfg.get("ci", "both")
    if ci not in CIS + ("both", "none"):
        raise ProfileError(f"ci: {ci!r} (use github, gitlab, both or none)")
    cis = list(CIS) if ci == "both" else ([] if ci == "none" else [ci])
    tracker = cfg.get("tracker", "auto")
    if tracker == "auto":
        trackers = (cis + ["local"]) if "harnesses" in cfg else list(TRACKERS)
    elif tracker == "none":
        trackers = []
    elif tracker in TRACKERS:
        trackers = [tracker]
    else:
        raise ProfileError(f"tracker: {tracker!r}")
    return {"harnesses": harnesses, "lead": harnesses[0], "ci": cis, "trackers": trackers,
            "roles": _list(cfg, "roles", ROLES), "features": _list(cfg, "features", FEATURES)}


def tags(cfg):
    p = resolve(cfg)
    t = {f"harness_{h}" for h in p["harnesses"]} | {f"lead_{p['lead']}"}
    t |= {f"ci_{c}" for c in p["ci"]} | {f"tracker_{x}" for x in p["trackers"]}
    t |= {f"role_{r}" for r in p["roles"]} | {f.replace("-", "_") for f in p["features"]}
    if p["trackers"]:
        t.add("issues")
    return t, p["lead"]


def known_tags():
    return ({f"harness_{h}" for h in HARNESSES} | {f"lead_{h}" for h in HARNESSES} | {f"ci_{c}" for c in CIS}
            | {f"tracker_{x}" for x in TRACKERS} | {f"role_{r}" for r in ROLES}
            | {f.replace("-", "_") for f in FEATURES} | {"issues"})


def evaluate(expr, active):
    """True/False for an expression like "harness_codex or (ci_github and not split)"."""
    expr = (expr or "").strip()
    if not expr:
        return True
    node = ast.parse(expr, mode="eval").body
    known = known_tags()

    def ev(n):
        if isinstance(n, ast.BoolOp):
            vals = [ev(v) for v in n.values]
            return all(vals) if isinstance(n.op, ast.And) else any(vals)
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.Not):
            return not ev(n.operand)
        if isinstance(n, ast.Name):
            if n.id not in known:
                raise ProfileError(f"unknown tag {n.id!r} in {expr!r}")
            return n.id in active
        if isinstance(n, ast.Constant) and isinstance(n.value, bool):
            return n.value
        raise ProfileError(f"not allowed in {expr!r}: {ast.dump(n)}")
    return ev(node)


class Components:
    def __init__(self, data):
        self.files = [(p, e) for p, e in data.get("files", [])]
        self.json_keys = data.get("json_keys", {})
        self.verbatim = data.get("verbatim", [])

    @classmethod
    def load(cls, root):
        p = os.path.join(root, COMPONENTS)
        if not os.path.exists(p):
            return cls({})
        return cls(json.load(open(p, encoding="utf-8")))

    def rule(self, rel):
        for pattern, expr in self.files:
            if fnmatch.fnmatchcase(rel, pattern):
                return expr
        return ""

    def wanted(self, rel, active):
        return evaluate(self.rule(rel), active)


def render_text(rel, text, active, lead, comps):
    """The file as this profile wants it: unselected blocks and JSON keys removed."""
    if any(fnmatch.fnmatchcase(rel, p) for p in comps.verbatim):
        return text
    if LEAD in text:
        text = text.replace(LEAD, lead)
    if "agent-team:if" in text:
        out, keep, depth = [], True, 0
        for line in text.split("\n"):
            m = BEGIN.search(line)
            if m:
                if depth:
                    raise ProfileError(f"{rel}: nested agent-team:if")
                depth, keep = 1, evaluate(m.group(1), active)
                if keep:
                    out.append(line)
                continue
            if depth and END.search(line):
                if keep:
                    out.append(line)
                depth, keep = 0, True
                continue
            if keep:
                out.append(line)
        if depth:
            raise ProfileError(f"{rel}: agent-team:if without agent-team:end")
        text = "\n".join(out)
    rules = comps.json_keys.get(rel)
    if rules:
        data = json.loads(text)
        for dotted, expr in rules.items():
            if not evaluate(expr, active):
                *path, last = dotted.split(".")
                node = data
                for k in path:
                    node = node.get(k, {}) if isinstance(node, dict) else {}
                if isinstance(node, dict):
                    node.pop(last, None)
        text = json.dumps(data, indent=2) + "\n"
    return text


def is_text(path):
    try:
        with open(path, "rb") as f:
            return b"\0" not in f.read(8192)
    except OSError:
        return False


SKIP_DIRS = {".git", "__pycache__", "node_modules", ".agent-team"}


def walk(root):
    out = []
    for d, dirs, files in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
        for f in sorted(files):
            if f.endswith(".pyc"):
                continue
            out.append(os.path.relpath(os.path.join(d, f), root).replace(os.sep, "/"))
    return out


def render_tree(src, dst, cfg):
    """Copy the template at src into dst as the profile wants it. Returns (kept, dropped)."""
    import shutil
    active, lead = tags(cfg)
    comps = Components.load(src)
    kept, dropped = [], []
    for rel in walk(src):
        if not comps.wanted(rel, active):
            dropped.append(rel)
            continue
        s, d = os.path.join(src, rel), os.path.join(dst, rel)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        if is_text(s):
            text = open(s, encoding="utf-8").read()
            open(d, "w", encoding="utf-8").write(render_text(rel, text, active, lead, comps))
            shutil.copymode(s, d)
        else:
            shutil.copy2(s, d)
        kept.append(rel)
    return kept, dropped


def describe(cfg):
    p = resolve(cfg)
    return (f"harnesses {', '.join(p['harnesses'])} (lead {p['lead']}); CI {', '.join(p['ci']) or 'none'}; "
            f"tracker {', '.join(p['trackers']) or 'none'}; roles {', '.join(p['roles'])}; "
            f"features {', '.join(p['features']) or 'none'}")
