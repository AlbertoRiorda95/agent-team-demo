---
feature: <feature>
ready: no               # yes only when the checklist below is complete
updated: YYYY-MM-DD
owner: designer
milestone:              # optional: roadmap milestone (M0, M1...) when the file name does not match a roadmap feature
features:               # optional: the roadmap features this spec covers, comma-separated
---

# <Feature name>

## Goal
<who it is for, what they achieve, how we know it works>

## Out of scope
- ...

## User flows
1. ...

## Screens and states
| Screen / component | States | Notes |
|---|---|---|
| ... | empty, loading, error, success | ... |

Responsive behavior: ...
Accessibility: ...
Tokens: only from the design system; new tokens proposed here: ...

## Data and API
Entities and fields: ...
Contract changes (applied by backend to `docs/api/`):
- ...
Breaking for existing clients: no

## Acceptance criteria
- [ ] ...

## Test seams
<!-- The public interfaces the tests go through, agreed in the studio session so
     agents in CI never have to ask. One line each: seam, what it catches, what it misses. -->
- API: `<METHOD /path>`, integration test on the test database: ...
- UI: the <screen> page at the spec's viewports, API mocked: ...

## Reuse
<!-- For each non-trivial part: what is reused and why, or why it is written.
     Check docs/general/libraries.md (the team's libraries) and what the project
     already has first; a new third-party dependency is decided here, with the user. -->
- <part>: <existing module | team library `name` | third-party `name` (license, why) | written here (why)>

## Decisions
- YYYY-MM-DD — <decision> — <one-line reason>

## Open questions
- (none)

## Task breakdown
<!-- Issue: leave "-" for scripts/create-issues.py to create the issue; "#12" when an
     existing issue already tracks the row; "done" when it is finished.
     Depends on: row numbers of this spec, or <feature>#<n> for a row of another spec.
     Monorepo: start the Task with the service it touches, "[orders] Add the endpoint";
     dispatch then runs one task per role and per service. -->
| # | Role | Task | Depends on | Issue |
|---|---|---|---|---|
| 1 | backend | ... | — | - |
| 2 | frontend | ... | 1 | - |

## Readiness checklist
- [ ] goal, users and out of scope agreed
- [ ] every flow has its error and edge cases
- [ ] every screen has empty, loading, error and success states
- [ ] contract changes written, breaking changes approved by the user
- [ ] acceptance criteria are observable
- [ ] test seams agreed
- [ ] reuse decided: team libraries and new dependencies named, or "none"
- [ ] task breakdown with roles and dependencies
- [ ] no open questions
