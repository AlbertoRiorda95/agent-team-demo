"""The tracker-independent model: issues, comments, the Tracker interface and the
parsers that read our own issue texts back (role, dependencies, keys).

Every adapter in agentteam/trackers/ implements Tracker. The scripts
(create-issues.py, split-issue.py, dispatch.py) only talk to this interface, so
a new tracker is one new file.
"""
import json
import re
import subprocess
import urllib.error
import urllib.request

ROLES = {"designer", "frontend", "backend", "optimizer", "devops", "security", "writer"}
ON_DEMAND = {"optimizer", "security", "writer"}
HOLD = "hold"
MARK_CREATED = "created-by: scripts/create-issues.py"


class TrackerError(RuntimeError):
    pass


class Unsupported(TrackerError):
    """The tracker has no such feature; callers fall back or skip."""


class Issue:
    """One issue, as every adapter returns it.

    ref     the id the tracker's API uses (GitHub number, Jira key, Linear uuid...)
    id      how people write it: "#12", "PROJ-12", "ENG-34"
    number  the id without "#", for commands: "12", "PROJ-12"
    """

    def __init__(self, ref, id, title, body="", open=True, done=False, labels=None,
                 milestone=None, parent=None, url="", author=None, extra=None):
        # Redmine, and GitHub after an edit on the web, store \r\n: the parsers expect \n
        self.ref, self.id, self.title, self.body = str(ref), id, title or "", (body or "").replace("\r\n", "\n")
        self.open, self.done = open, done
        self.labels = list(labels or [])
        self.milestone, self.parent, self.url, self.author = milestone, parent, url, author
        self.extra = extra or {}

    @property
    def number(self):
        return self.id.lstrip("#")

    def __repr__(self):
        return f"Issue({self.id} {self.title!r} open={self.open} done={self.done} labels={self.labels})"


class Comment:
    def __init__(self, body, author="", mine=False, bot=False):
        self.body, self.author, self.mine, self.bot = body or "", author, mine, bot


class Tracker:
    """Interface of an issue tracker. Methods an adapter cannot support raise Unsupported."""

    name = "base"
    html_markers = True          # can hide markers in <!-- --> (otherwise a plain footer line)
    native_milestones = True

    def __init__(self, cfg):
        self.cfg = cfg

    # ---- text helpers
    def marker(self, text):
        return f"<!-- {text} -->" if self.html_markers else f"[agent-team] {text}"

    def format_body(self, markdown):
        """Convert the markdown we write into the tracker's markup."""
        return markdown

    # ---- read
    def issues(self):
        """Every issue of the project, open and closed."""
        raise NotImplementedError

    def get(self, ref):
        ref = str(ref).lstrip("#")
        for i in self.issues():
            if i.ref == ref or i.number == ref:
                return i
        raise TrackerError(f"issue not found: {ref}")

    def milestones(self):
        """{code: (ref, title)}, the code being the part before " · " ("M0")."""
        raise Unsupported("milestones")

    def children(self, parent):
        raise Unsupported("sub-issues")

    def blockers(self, issue):
        """Refs of the issues that natively block this one ([] when unknown)."""
        return []

    def comments(self, issue):
        raise Unsupported("comments")

    def me(self):
        return None

    # ---- write
    def create_milestone(self, title, description):
        raise Unsupported("milestones")

    def create_issue(self, title, body, milestone=None, parent=None):
        raise NotImplementedError

    def set_milestone(self, issue, milestone_ref):
        raise Unsupported("milestones")

    def edit_issue(self, issue, title, body):
        """Replace the title and the description (body in markdown, as for create_issue)."""
        raise Unsupported("editing issues")

    def link_child(self, parent, child):
        raise Unsupported("sub-issues")

    def unlink_child(self, parent, child):
        raise Unsupported("sub-issues")

    def add_dependency(self, issue, blocker):
        """Native "blocker blocks issue". False when the tracker cannot store it."""
        return False

    def comment(self, issue, body):
        raise Unsupported("comments")

    def add_label(self, issue, label):
        raise Unsupported("labels")

    def remove_label(self, issue, label):
        raise Unsupported("labels")

    def check(self):
        """Read-only checks: [(ok, message)]."""
        return [(True, f"{self.name}: {len(self.issues())} issues readable")]


# ---- parsers of our own texts (markdown and Jira wiki markup)

def code(title):
    return (title or "").split(" · ")[0].strip()


def ms_key(title):
    m = re.match(r"M(\d+)\b", title or "")
    return (0, int(m.group(1))) if m else (1, title or "")


def section(body, name):
    m = re.search(r"^(?:##|h2\.) " + re.escape(name) + r"\s*\n(.*?)(?=^(?:##|h2\.) |\Z)", body or "", re.S | re.M)
    return m.group(1) if m else ""


def role_of(issue):
    body, title = issue.body, issue.title
    m = re.search(r"To start it[^\n]*(?:`|\{\{)agent:([a-z][a-z-]*)(?:`|\}\})", body)
    if m and m.group(1) != "split":
        return m.group(1)
    m = re.search(r"\(the ([a-z]+) task\)", body)
    if m:
        return m.group(1)
    m = re.search(r"^Role:\s*([a-z]+)\s*$", body, re.M)
    if m:
        return m.group(1)
    m = re.search(r" · ([a-z]+): ", title)
    return m.group(1) if m else None


SERVICE = re.compile(r"^\s*\[([a-z0-9][a-z0-9-]*)\]")


def service_of(issue):
    """The service a task touches, in a monorepo: its task text starts with "[orders]"
    (the Task cell of the spec row, or of a split). None: not tied to one service."""
    m = re.search(r" · [a-z]+: (\[[^\]]+\])", issue.title) or re.search(r"^## Task\n(\[[^\]]+\])", issue.body, re.M)
    m = m and SERVICE.match(m.group(1))
    return m.group(1) if m else None


def deps_of(issue):
    """(ids written in "Depends on", unresolved "task N" mentions)."""
    text = section(issue.body, "Depends on").strip().split("\n\n")[0]   # the paragraph, not the markers below
    ids = re.findall(r"#(\d+)|\b([A-Z][A-Z0-9]+-\d+)\b", text)
    refs = [a or b for a, b in ids]
    loose = [t for t in re.findall(r"task \d+(?: \(done\))?", text) if "(done)" not in t]
    return refs, loose


def key_of(issue):
    m = re.search(r"key: ([^\n]+?)(?: -->|\s*$)", issue.body, re.M)     # milestone codes may hold spaces
    return m.group(1) if m else None


def started(issue):
    return any(l.startswith("agent:") and l != "agent:split" for l in issue.labels)


# ---- process and HTTP helpers (patched by the tests)

def sh(cmd, inp=None):
    return subprocess.run(cmd, input=inp, capture_output=True, text=True)


def run(cmd, inp=None):
    p = sh(cmd, inp)
    if p.returncode:
        raise TrackerError(f"{' '.join(cmd[:3])}: {p.stderr.strip() or p.stdout.strip()}")
    return p.stdout


def http_json(method, url, headers=None, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    h = {"Accept": "application/json"}
    if data is not None:
        h["Content-Type"] = "application/json"
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        detail = e.read()[:400].decode("utf-8", "replace")
        raise TrackerError(f"{method} {url}: HTTP {e.code} {detail}")
    except urllib.error.URLError as e:
        raise TrackerError(f"{method} {url}: {e.reason}")
