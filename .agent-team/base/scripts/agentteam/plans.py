"""The split plan: format, checks, how it is shown in a comment and read back.

Plan (JSON):
  {
    "parent": "42",                        # the issue being split: 42, "#42", "PROJ-12"
    "summary": "Why this split, in two or three sentences.",
    "spec": "docs/design/orders.md",       # optional
    "tasks": [                             # 1 to 6, in execution order
      {"key": "contract", "role": "backend",
       "title": "Add the date filter to the orders API contract",
       "task": "What to do, in a few sentences.",
       "acceptance": ["Checkable without reading the code"],
       "files": ["docs/api/openapi.yaml"],
       "depends_on": []}                   # keys of earlier tasks, or "<issue>:<key>" (see below)
    ]
  }

A task may also wait for a task of another issue's plan: "depends_on": ["12:api"]
is the task with key "api" of the plan of issue 12 (a number, "#12" or "PROJ-12").
That issue must be split first: create refuses otherwise.
"""
import json
import re

from . import core

ROLES = ["designer", "frontend", "backend", "devops", "optimizer", "security", "writer"]
MAX_TASKS = 6
START, END = "split-plan v1", "split-plan-end"
LABEL = "agent:split"
KEY = r"[a-z0-9][a-z0-9-]{0,29}"
CROSS = re.compile(rf"#?([A-Za-z0-9][A-Za-z0-9_-]*):({KEY})")


def cross_ref(dep):
    """(issue, key) of a "<issue>:<key>" dependency, None for a key of the same plan."""
    m = CROSS.fullmatch(dep) if isinstance(dep, str) else None
    return (m.group(1), m.group(2)) if m else None


def same_issue(value, issue_number):
    return str(value).lstrip("#") == str(issue_number).lstrip("#")


def validate(plan, issue_number=None):
    err = []
    if not isinstance(plan, dict):
        return ["the plan must be a JSON object"]
    if issue_number is not None and not same_issue(plan.get("parent"), issue_number):
        err.append(f'"parent" must be {issue_number}')

    def text(where, value, limit, required=True):
        if not isinstance(value, str) or (required and not value.strip()):
            err.append(f"{where}: missing or not a string")
            return
        if len(value) > limit:
            err.append(f"{where}: longer than {limit} characters")
        if "```" in value or "<!--" in value or "{code" in value:
            err.append(f"{where}: must not contain ```, {{code or <!--")

    text("summary", plan.get("summary"), 800)
    if "spec" in plan:
        text("spec", plan["spec"], 200)
    tasks = plan.get("tasks")
    if not isinstance(tasks, list) or not 1 <= len(tasks) <= MAX_TASKS:
        err.append(f'"tasks" must list 1 to {MAX_TASKS} tasks; with more, split the issue into features first')
        return err
    keys = []
    for i, t in enumerate(tasks, 1):
        w = f"task {i}"
        if not isinstance(t, dict):
            err.append(f"{w}: not an object")
            continue
        k = t.get("key")
        if not isinstance(k, str) or not re.fullmatch(KEY, k):
            err.append(f'{w}: "key" must be 1-30 lowercase letters, digits or hyphens')
        elif k in keys:
            err.append(f'{w}: duplicate key "{k}"')
        if t.get("role") not in ROLES:
            err.append(f'{w}: "role" must be one of {", ".join(ROLES)}')
        text(f"{w} title", t.get("title"), 90)
        text(f"{w} task", t.get("task"), 2000)
        acc = t.get("acceptance")
        if not isinstance(acc, list) or not 1 <= len(acc) <= 10:
            err.append(f'{w}: "acceptance" must list 1 to 10 criteria')
        else:
            for j, a in enumerate(acc, 1):
                text(f"{w} acceptance {j}", a, 300)
        files = t.get("files", [])
        if not isinstance(files, list) or len(files) > 15:
            err.append(f'{w}: "files" must be a list of at most 15 paths')
        else:
            for j, f in enumerate(files, 1):
                text(f"{w} file {j}", f, 200)
        deps = t.get("depends_on", [])
        if not isinstance(deps, list):
            err.append(f'{w}: "depends_on" must be a list')
        else:
            for d in deps:
                x = cross_ref(d)
                if x is None and d not in keys:
                    err.append(f'{w}: "depends_on" may only list keys of earlier tasks or "<issue>:<key>", not {d!r}')
                elif x is not None and issue_number is not None and same_issue(x[0], issue_number):
                    err.append(f'{w}: "{d}" is this issue: use the key "{x[1]}" alone')
                elif x is not None and issue_number is None and same_issue(x[0], plan.get("parent")):
                    err.append(f'{w}: "{d}" is this issue: use the key "{x[1]}" alone')
        keys.append(k)
    return err


def confirm_text(trk, issue_id, n_tasks):
    if trk.name == "github":
        ok = f"reply `@claude ok` to create these {n_tasks} issues as sub-issues of {issue_id}, without labels"
        change = "reply `@claude` followed by what to change: a new proposal replaces this one"
    elif trk.name == "gitlab":
        n = issue_id.lstrip("#")
        ok = (f"run the pipeline with `SPLIT_ISSUE={n}` and `SPLIT_CONFIRM=ok` to create these "
              f"{n_tasks} issues, linked to {issue_id}, without labels")
        change = f"run it with `SPLIT_ISSUE={n}` and `SPLIT_FEEDBACK` set to what to change"
    else:
        n = issue_id.lstrip("#")
        ok = (f"confirm in the conversation that asked for it (`/agent-team:split-issue {n}`), or run "
              f"`python3 scripts/split-issue.py create {n}` to create these {n_tasks} sub-issues")
        change = "ask for the changes in the conversation: a new proposal replaces this one"
    return f"**To confirm**, {ok}.", f"**To change it**, {change}."


def render(plan, trk, issue_id):
    tasks = plan["tasks"]
    idx = {t["key"]: i for i, t in enumerate(tasks, 1)}
    rows = "\n".join(
        f"| {i} | {t['role']} | {t['title']} | {', '.join(str(idx.get(d, d)) for d in t.get('depends_on', [])) or '-'} |"
        for i, t in enumerate(tasks, 1))
    details = []
    for i, t in enumerate(tasks, 1):
        acc = "\n".join(f"- {a}" for a in t["acceptance"])
        files = ", ".join(f"`{f}`" for f in t.get("files", [])) or "-"
        details.append(f"**{i} · {t['role']}: {t['title']}**\n\n{t['task']}\n\nAcceptance:\n{acc}\n\nFiles: {files}")
    confirm, change = confirm_text(trk, issue_id, len(tasks))
    fold = trk.html_markers                      # <details> only where HTML renders
    lines = [trk.marker(START), f"### Proposed split of {issue_id}", "", plan["summary"],
             (f"\nSpec: `{plan['spec']}`" if plan.get("spec") else ""), "",
             "| # | Role | Task | Depends on |", "|---|---|---|---|", rows, "",
             "<details><summary>Task details</summary>" if fold else "#### Task details", "",
             "\n\n---\n\n".join(details), "", "</details>" if fold else "", "",
             confirm, change, "",
             "<details><summary>Plan data (what the confirmation creates)</summary>" if fold else "#### Plan data", "",
             "```json", json.dumps(plan, indent=2, ensure_ascii=False), "```", "",
             "</details>" if fold else "", trk.marker(END)]
    return "\n".join(lines)


def parse(body):
    """The plan inside a proposal comment, in Markdown or Jira wiki markup."""
    body = body or ""
    if START not in body:
        return None
    rest = body[body.index(START):]
    m = re.search(r"```json\n(.*?)\n```", rest, re.S) or re.search(r"\{code(?::json)?\}\n(.*?)\n\{code\}", rest, re.S)
    return json.loads(m.group(1)) if m else None
