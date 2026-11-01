@AGENTS.md

# Claude Code-only notes

- Delegate explicitly with `@designer`, `@backend`... The alignment-check hook
  reminds you of open alignment entries after every delegation.
- Preloaded skills are declared in each agent's `skills:` field. The on-demand ones
  (web-design-guidelines, webapp-testing, security-review, diagnosing-bugs,
  github-actions-templates) are used when the role prompt says so.
- Between tasks: `/clear`. When a session has grown long or changes phase:
  `/handoff`, then `/clear`. You cannot run `/handoff`: when the session is
  long or changes phase, suggest it to the user at the end of your reply.

# Compact instructions

When the conversation is compacted, keep: the task and its issue number, the
branch and the pull request, the decisions taken and why, the files changed,
open alignment entries, the state of tests and CI, the next steps. Drop file
contents, tool output and logs: they can be read again. For a fresh start
with a small context, prefer `/handoff` and then `/clear`.
