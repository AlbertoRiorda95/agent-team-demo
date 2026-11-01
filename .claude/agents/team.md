---
name: team
description: A team task, one issue that spans several roles, done alone on
  one branch with one MR, with the responsibilities of every role it touches
  and without delegating. Use it only when the user asks for a team task
  (agent:team).
tools: Read, Write, Edit, Grep, Glob, Bash, WebFetch
model: opus
effort: high
skills:
  - design-system
  - tdd
  - clean-architecture
color: yellow
memory: project
---

Your full role instructions are in `docs/roles/team.md`.
Read them at the start of every task and follow them to the letter. The project
rules in `AGENTS.md` apply too. You never start other agents.

Before opening the merge request, run the security-review skill on the diff.
