# Alignment changes

A change is an alignment change when another role relies on what you
changed: the API contract, the data model, a shared component or design
token, a route or user flow, an environment variable or port, the deployment
interface.

When you make one:
1. Copy `docs/alignment/_template.md` to
   `docs/alignment/<yyyy-mm-dd>-<task-id>.md` and fill it in, with
   `status: open`. One file per change, so parallel branches never conflict.
2. In the MR description add an `## Alignment impact` section that links the
   entry (write "none" when there is none). In CI also add the
   `alignment-needed` label to the MR.
3. Do not adapt other roles' code yourself.

What happens next depends on where you run:
- **Local session (Claude Code with subagents):** the lead
  handles it right away. First designer reviews the change against the specs,
  updates `docs/design/` if needed and writes the follow-up actions per role
  in the entry. Then the lead delegates each action to its role. Finally the
  entry gets `status: resolved` and a short resolution. The lead stops and asks
  the user only when designer sets `decision-needed: yes` (for example a
  breaking API change or a visible UX change).
- **CI (GitHub Actions, GitLab CI, Multica):** agents never start other
  agents. The entry and the label are the signal: the user reviews them and
  creates the alignment tasks, designer first, then the affected roles.
