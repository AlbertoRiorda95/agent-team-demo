# Rules for agents, by situation

`AGENTS.md` is loaded into every agent's context on every turn, so it keeps only
what every task needs, plus one pointer per situation to a file here. An agent
reads a file in this folder only when its situation applies.

- `workflow.md`: planning or leading a feature with several roles
- `alignment.md`: your change affects something another role relies on
<!-- agent-team:if split -->
- `splitting.md`: you propose how to split an issue
<!-- agent-team:end -->
- `merge-requests.md`: you open or update an MR
- `ci.md`: a check fails, or you touch tests, UI, workflows or CI
- `dependencies.md`: you add a dependency, or write something generic a library could do

When you add a rule, ask first whether a check can enforce it (lint, type check,
CI job, hook, CODEOWNERS): a check never forgets, a sentence here can be missed.
Only judgement calls belong in these files.
