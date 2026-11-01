"""Roadmap and specs in docs/design/ -> the milestones and task issues to create.

Every planned issue carries a stable key ("key: docs/design/x.md#3", or
"design:M1:login", or "docs/design/x.md#team") in a marker, so it is found again
even if its title changes (for example when rows are added to the breakdown).

Task issues also carry "spec-row: <hash>" of the row(s) they come from. When a
row changes after its issue was written (a review of the design merge request,
a fix), create-issues and dispatch rewrite the issue if its task has not started
yet, and only warn if it has.

When a feature that has a "Design:" issue gets a ready spec, that issue is
reused ("adopt"): with one new task it becomes the task; with several it becomes
the feature issue ("docs/design/x.md#feature") and the tasks its sub-issues.
"""
import glob
import hashlib
import os
import re

from . import core

DESIGN = "docs/design"
ROW_MARK = re.compile(r"spec-row: ([0-9a-f]{12})")
OTHER_ROW = re.compile(r"\b([a-z0-9][a-z0-9-]*)#(\d+)")   # "app-shell#2": row 2 of docs/design/app-shell.md


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


def front(text):
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    meta = {}
    if m:
        for line in m.group(1).splitlines():
            k, _, v = line.partition(":")
            meta[k.strip()] = v.split("#")[0].strip()
    return meta


def items(value):
    """Comma or semicolon separated values; separators inside (), [] or `` do not split."""
    out, cur, depth, code = [], "", 0, False
    for ch in (value or "").strip().removeprefix("[").removesuffix("]"):
        if ch == "`":
            code = not code
        elif not code and ch in "([":
            depth += 1
        elif not code and ch in ")]":
            depth = max(depth - 1, 0)
        elif not code and not depth and ch in ",;":
            out.append(cur)
            cur = ""
            continue
        cur += ch
    out.append(cur)
    return [x.strip(" '\"") for x in out if x.strip(" '\"")]


def feature_name(item):
    """The name of a roadmap feature: "`audit-log` (who did what)" -> "audit-log"."""
    m = re.match(r"\s*`([^`]+)`", item)
    return m.group(1).strip() if m else re.sub(r"\s*\(.*$", "", item).strip() or item.strip()


def md_section(text, name):
    m = re.search(r"^## " + re.escape(name) + r"\s*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    return m.group(1) if m else ""


def table(block):
    rows = []
    for line in block.splitlines():
        line = line.strip()
        if not line.startswith("|") or re.match(r"^\|[\s:|-]+\|$", line):
            continue
        rows.append([c.strip() for c in line.strip("|").split("|")])
    return rows[1:] if rows else []


def row_hash(rows):
    """The fingerprint of breakdown rows: role, task and dependencies (not the number or the Issue column)."""
    norm = "\n".join("|".join(" ".join(c.split()).lower() if i == 0 else " ".join(c.split())
                               for i, c in enumerate((r + ["", "", ""])[1:4])) for r in rows)
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:12]


def row_of(issue):
    m = ROW_MARK.search(issue.body or "")
    return m.group(1) if m else None


def load_spec(path, text=None):
    """The spec if it is ready, else None. text: its content read elsewhere (another Git ref)."""
    text = open(path, encoding="utf-8").read() if text is None else text
    meta = front(text)
    if meta.get("ready") != "yes":
        return None
    title = re.search(r"^# (.+)$", text, re.M)
    title = re.sub(r"\s+[—-]\s+.*$", "", title.group(1)).strip() if title else os.path.basename(path)
    block = md_section(text, "Task breakdown")
    rows = [r for r in table(block) if len(r) >= 3 and r[0].strip().isdigit() and r[2] not in ("", "...")]
    return {"path": path, "title": title, "rows": rows,
            "slug": slug(os.path.splitext(os.path.basename(path))[0]),
            "milestone": meta.get("milestone", ""), "features": items(meta.get("features", "")),
            "needs": {s for r in rows if len(r) > 3 for s, _ in OTHER_ROW.findall(r[3])}}


def load_roadmap():
    path = os.path.join(DESIGN, "project.md")
    if not os.path.exists(path):
        return []
    out = []
    for r in table(md_section(open(path, encoding="utf-8").read(), "Roadmap")):
        if len(r) >= 2 and r[0] not in ("", "..."):
            out.append((r[0], [(feature_name(f), f) for f in items(r[1]) if f != "..."]))
    return out


def tracked(r):
    """The Issue column: None (create), 'done', or an issue id ("12", "PROJ-12")."""
    v = r[4].strip() if len(r) > 4 else ""
    if v in ("", "-", "—"):
        return None
    m = re.match(r"#?(\d+)$", v) or re.match(r"([A-Z][A-Z0-9]+-\d+)$", v)
    return m.group(1) if m else "done"


def start_line(trk, role):
    if trk.name == "redmine":
        return f"To start it, once the tasks it depends on are done: `agent:{role}`, with scripts/dispatch.py."
    return (f"To start it, add the label `agent:{role}` once the issues it depends on are done "
            f"(or let scripts/dispatch.py do it).")


def deps_text(t, issue_of, done=()):
    """(text for "Depends on", the issues it names) of a planned task; issue_of(key) -> Issue or None."""
    def row(d):
        path, num = d.split("#")
        other = "" if t["key"].startswith(path + "#") else os.path.splitext(os.path.basename(path))[0] + " "
        return f"{other}task {num}"
    found = [(d, issue_of(d)) for d in t["deps"]]
    deps = [i for _, i in found if i is not None]
    text = ", ".join([i.id for i in deps] + [f"{row(d)} (done)" for d, i in found if i is None and d in done]
                     + [row(d) for d, i in found if i is None and d not in done])
    return text or "none", deps


def task_now(path, text, key, trk):
    """(planned task with this key, keys of the rows marked done) from a spec's text; (None, ...) if the row is gone."""
    spec = load_spec(path, text)
    if spec is None:
        return None, set()
    tasks = task_issues(spec, key.endswith("#team"), trk)
    done = {t["key"] for t in tasks if t["ref"] == "done"}
    return next((t for t in tasks if t["key"] == key and t["ref"] is None), None), done


def _task(key, title, body, deps=(), ref=None, legacy=None):
    return {"key": key, "title": title, "body": body, "deps": list(deps), "ref": ref, "legacy": legacy}


def task_issues(spec, team, trk):
    out = []
    mark = trk.marker(core.MARK_CREATED)
    for r in spec["rows"]:
        ref = tracked(r)
        if ref is not None:
            out.append(_task(f"{spec['path']}#{r[0].strip()}", None, None, ref=ref))
    rows = [r for r in spec["rows"] if tracked(r) is None]
    if not rows:
        return out
    if team:                                   # one issue for the whole breakdown, one agent (docs/roles/team.md)
        key = f"{spec['path']}#team"
        lines = "\n".join(f"| {r[0]} | {r[1]} | {r[2]} | {r[3] if len(r) > 3 else '-'} |" for r in rows)
        nums = ", ".join(r[0] for r in rows)
        out.append(_task(key, f"{spec['title']} · team task (tasks {nums})",
                         f"## Spec\n{spec['path']} - section: Task breakdown, rows {nums}\n\n"
                         f"## Task\nImplement these tasks of the breakdown on one branch, one PR:\n\n"
                         f"| # | Role | Task | Depends on |\n|---|---|---|---|\n{lines}\n\n"
                         f"{start_line(trk, 'team')}\n\n"
                         f"{mark}\n{trk.marker('key: ' + key)}\n{trk.marker('spec-row: ' + row_hash(rows))}"))
        return out
    total = len(spec["rows"])
    for r in rows:
        num, role, task = r[0].strip(), r[1].strip().lower(), r[2].strip()
        text = r[3] if len(r) > 3 else ""
        deps = [f"{spec['path']}#{d}" for d in re.findall(r"\d+", OTHER_ROW.sub("", text))]
        deps += [f"{DESIGN}/{s}.md#{d}" for s, d in OTHER_ROW.findall(text)]
        short = task if len(task) <= 70 else task[:67].rstrip() + "..."
        key = f"{spec['path']}#{num}"
        out.append(_task(key, f"{spec['title']} · {num}/{total} · {role}: {short}",
                         f"## Spec\n{spec['path']} - section: Task breakdown, row {num}\n\n"
                         f"## Task\n{task}\n\n## Depends on\n{{deps}}\n\n{start_line(trk, role)}\n\n"
                         f"{mark}\n{trk.marker('key: ' + key)}\n{trk.marker('spec-row: ' + row_hash([r]))}",
                         deps=deps,
                         legacy=(f"{spec['title']} · {num}/", f" · {role}: ")))
    return out


def after_needs(entries, found):
    """The roadmap entries of a milestone, a spec after the specs its rows depend on."""
    left, out = list(entries), []
    while left:
        pending = {found[f]["slug"] for f, _ in left if found[f]}
        pick = next((e for e in left if not found[e[0]] or not (found[e[0]]["needs"] - {found[e[0]]["slug"]}) & pending),
                    left[0])                                     # a cycle: keep the roadmap order
        left.remove(pick)
        out.append(pick)
    return out


def adopting(spec, tasks, designs, milestone, mark, trk):
    """The tasks of a spec, set to reuse the feature's "Design:" issue if there is one."""
    new = [t for t in tasks if t["ref"] is None]
    if len(new) == 1:
        new[0]["adopt"] = designs
        return tasks
    if not new:
        return tasks
    key = f"{spec['path']}#feature"
    feature = _task(key, f"{spec['title']} ({milestone})",
                    f"## Spec\n{spec['path']}\n\n## Feature\nRoadmap milestone {milestone}. The work is in the "
                    f"sub-issues, one per row of the spec's Task breakdown; this issue is done when they are.\n\n"
                    f"Not a task: dispatch never starts it.\n\n{mark}\n{trk.marker('key: ' + key)}")
    feature.update(kind="feature", adopt=designs)
    for t in new:
        t["parent"] = key
    return [feature] + tasks


def build_plan(team, trk):
    """[(milestone or None, [task])]; milestone = (code, title, description)."""
    specs = [s for s in (load_spec(p) for p in sorted(glob.glob(os.path.join(DESIGN, "*.md")))
                         if not os.path.basename(p).startswith("_")
                         and os.path.basename(p) not in ("project.md", "README.md")) if s]
    used, groups = set(), []
    mark = trk.marker(core.MARK_CREATED)
    for milestone, entries in load_roadmap():
        children, feats = [], [name for name, _ in entries]
        found = {feat: next((s for s in specs if s["slug"] == slug(feat)
                             or (slug(feat) in map(slug, s["features"])
                                 and (not s["milestone"] or s["milestone"] == milestone))), None)
                 for feat, _ in entries}
        for feat, described in after_needs(entries, found):
            spec = found[feat]
            if spec:
                if spec["path"] not in used:
                    used.add(spec["path"])
                    designs = [(f"design:{milestone}:{slug(f)}", [f"Design: {f} ({milestone})", f"Design: {d} ({milestone})"])
                               for f, d in entries if found[f] is spec]
                    children += adopting(spec, task_issues(spec, team, trk), designs, milestone, mark, trk)
                continue
            key = f"design:{milestone}:{slug(feat)}"
            children.append(_task(key, f"Design: {feat} ({milestone})",
                                  f"## Roadmap\nMilestone {milestone}, feature \"{feat}\" (docs/design/project.md)"
                                  f"{': ' + described if described != feat else ''}.\n\n"
                                  f"## Task\nDesign this feature in a studio session with you: `/design-studio {slug(feat)}`. "
                                  f"It produces docs/design/{slug(feat)}.md; once it is ready and merged, create its "
                                  f"task issues again with scripts/create-issues.py.\n\n"
                                  f"No agent: design happens with you, not in CI.\n\n{mark}\n{trk.marker('key: ' + key)}"))
        ms = (milestone, f"{milestone} · {', '.join(feats)}"[:120],
              f"Roadmap milestone {milestone}: {', '.join(feats)} (docs/design/project.md). "
              f"Created by scripts/create-issues.py.")
        groups.append((ms, children))
    for s in specs:
        if s["path"] not in used:
            groups.append((None, task_issues(s, team, trk)))
    return groups
