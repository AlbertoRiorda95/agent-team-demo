"""GitHub, through the `gh` CLI (authenticated with `gh auth login`, or GH_TOKEN in CI).

Milestones are native milestones, children are sub-issues, dependencies use the
"blocked by" relation, labels are labels.
"""
import json
import os

from .. import core


class Adapter(core.Tracker):
    name = "github"

    def __init__(self, cfg):
        super().__init__(cfg)
        self.repo = os.environ.get("GITHUB_REPOSITORY") or core.run(
            ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).strip()
        self._me, self._ids = False, {}

    def api(self, *args, inp=None):
        return core.run(["gh", "api", *args], inp)

    def lines(self, *args):
        return [json.loads(l) for l in self.api(*args).splitlines() if l.strip()]

    def _issue(self, i):
        state = (i.get("state") or "").upper()
        reason = (i.get("stateReason") or i.get("state_reason") or "COMPLETED").upper()
        labels = [l["name"] if isinstance(l, dict) else l for l in i.get("labels", [])]
        ms = i.get("milestone") or {}
        user = i.get("author") or i.get("user") or {}
        if i.get("id") and isinstance(i.get("id"), int):
            self._ids[str(i["number"])] = i["id"]
        return core.Issue(i["number"], f"#{i['number']}", i.get("title"), i.get("body"),
                          open=state == "OPEN", done=state == "CLOSED" and reason != "NOT_PLANNED",
                          labels=labels, milestone=ms.get("title"), url=i.get("url") or i.get("html_url", ""),
                          author=user.get("login"))

    def issues(self):
        fields = "number,title,body,state,stateReason,labels,milestone,url,author"
        p = core.sh(["gh", "issue", "list", "--repo", self.repo, "--state", "all", "--limit", "5000", "--json", fields])
        if p.returncode and "stateReason" in p.stderr:
            p = core.sh(["gh", "issue", "list", "--repo", self.repo, "--state", "all", "--limit", "5000",
                         "--json", fields.replace(",stateReason", "")])
        if p.returncode:
            raise core.TrackerError(p.stderr.strip())
        return [self._issue(i) for i in json.loads(p.stdout or "[]")]

    def get(self, ref):
        return self._issue(json.loads(self.api(f"repos/{self.repo}/issues/{str(ref).lstrip('#')}")))

    def _db_id(self, ref):
        ref = str(ref).lstrip("#")
        if ref not in self._ids:
            self._ids[ref] = int(self.api(f"repos/{self.repo}/issues/{ref}", "--jq", ".id").strip())
        return self._ids[ref]

    def milestones(self):
        rows = self.lines("--paginate", f"repos/{self.repo}/milestones?state=all&per_page=100",
                          "--jq", ".[] | {number, title}")
        return {core.code(m["title"]): (m["number"], m["title"]) for m in rows}

    def create_milestone(self, title, description):
        return json.loads(self.api("-X", "POST", f"repos/{self.repo}/milestones", "-f", f"title={title}",
                                   "-f", f"description={description}", "--jq", "{number}"))["number"]

    def create_issue(self, title, body, milestone=None, parent=None):
        extra = ["-F", f"milestone={milestone}"] if milestone else []
        i = json.loads(self.api("-X", "POST", f"repos/{self.repo}/issues", "-f", f"title={title}",
                                "-f", f"body={body}", *extra, "--jq", "{number, id, html_url}"))
        self._ids[str(i["number"])] = i["id"]
        issue = core.Issue(i["number"], f"#{i['number']}", title, body, url=i.get("html_url", ""))
        if parent is not None:
            self.link_child(parent, issue)
        return issue

    def set_milestone(self, issue, milestone_ref):
        self.api("-X", "PATCH", f"repos/{self.repo}/issues/{issue.ref}", "-F", f"milestone={milestone_ref}")

    def edit_issue(self, issue, title, body):
        self.api("-X", "PATCH", f"repos/{self.repo}/issues/{issue.ref}", "-f", f"title={title}", "-f", f"body={body}")

    def children(self, parent):
        rows = self.lines("--paginate", f"repos/{self.repo}/issues/{parent.ref}/sub_issues",
                          "--jq", ".[] | {number, id, title, body, state, state_reason, labels, milestone, html_url}")
        return [self._issue(r) for r in rows]

    def link_child(self, parent, child):
        self.api("-X", "POST", f"repos/{self.repo}/issues/{parent.ref}/sub_issues",
                 "-F", f"sub_issue_id={self._db_id(child.ref)}")

    def unlink_child(self, parent, child):
        self.api("-X", "DELETE", f"repos/{self.repo}/issues/{parent.ref}/sub_issue",
                 "-F", f"sub_issue_id={self._db_id(child.ref)}")

    def blockers(self, issue):
        p = core.sh(["gh", "api", f"repos/{self.repo}/issues/{issue.ref}/dependencies/blocked_by",
                     "--jq", ".[].number"])
        return p.stdout.split() if p.returncode == 0 else []

    def add_dependency(self, issue, blocker):
        p = core.sh(["gh", "api", "-X", "POST", f"repos/{self.repo}/issues/{issue.ref}/dependencies/blocked_by",
                     "-F", f"issue_id={self._db_id(blocker.ref)}"])
        return p.returncode == 0

    def me(self):
        if self._me is False:
            p = core.sh(["gh", "api", "user", "--jq", ".login"])   # fails with a CI token: then only bots count
            self._me = p.stdout.strip() if p.returncode == 0 else None
        return self._me

    def comments(self, issue):
        me = self.me()
        rows = self.lines("--paginate", f"repos/{self.repo}/issues/{issue.ref}/comments",
                          "--jq", ".[] | {body, login: .user.login, type: .user.type}")
        return [core.Comment(r["body"], r["login"], mine=bool(me) and r["login"] == me, bot=r["type"] == "Bot")
                for r in rows]

    def comment(self, issue, body):
        core.run(["gh", "issue", "comment", issue.ref, "--repo", self.repo, "--body-file", "-"], body)

    def add_label(self, issue, label):
        core.run(["gh", "issue", "edit", issue.ref, "--repo", self.repo, "--add-label", label])

    def remove_label(self, issue, label):
        core.sh(["gh", "issue", "edit", issue.ref, "--repo", self.repo, "--remove-label", label])

    def check(self):
        out = [(True, f"repository {self.repo}")]
        a = core.sh(["gh", "auth", "status"])
        out.append((a.returncode == 0, "gh authenticated" if a.returncode == 0 else "gh not authenticated: gh auth login"))
        out.append((True, f"{len(self.issues())} issues, {len(self.milestones())} milestones readable"))
        return out
