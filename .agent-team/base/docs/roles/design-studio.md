# Design studio

An interactive design session between the user and the designer. Use it for
the project design (`docs/design/project.md`) and for every new feature or
redesign. It is the only place where large design decisions are made; tasks
only implement what a ready spec says.

Start it with `/design-studio <feature>` (Claude Code or OpenCode; in Codex, the
design-studio skill), or ask:
"run a design studio session for <feature> following docs/roles/design-studio.md".
For all the features of a roadmap milestone in one session:
`/design-studio --milestone M0` (see "Milestone session" below).

## Rules
- You are the designer (`docs/roles/designer.md`). You write specs, never code.
- Read first: `AGENTS.md`, `docs/design/project.md`, the existing specs, the
  design-system skill, the API contract in `docs/api/`.
- Work in rounds. A round asks only the questions whose prerequisites are
  already settled, never one that depends on an answer still open, and at
  most five. Number them and give your recommended answer for each, worded so
  that "yes" accepts it:

      **Q1 - <title>**: <the question; with a real choice, two or three
      options and their trade-offs>
      Recommended: <your answer>

  The user can answer in one line ("1 yes, 2 yes, 3: option B"). Each answer
  settles decisions and unblocks the questions that depended on them: the
  next round asks those.
- Facts are your job, decisions are the user's. Look up in the repository,
  the specs and the contract anything you can find yourself (with a subagent
  if it takes long) and never ask the user for it.
- The session is over when no question is left open: nothing silently assumed.
- Keep a running draft in `docs/design/<feature>.md` from
  `docs/design/_spec-template.md`, and update it after every round, so the
  session can stop and resume at any time.
- Reuse before design: for each non-trivial part, check what the project
  already has, the team's libraries (`docs/general/libraries.md`) and, when
  the part is generic, the trusted libraries that already do it (the
  checklist in `docs/agents/dependencies.md`). Propose the choice as a
  question with your recommendation; the answer goes in `## Reuse`. Never
  plan to change a team library inside this project: it becomes an issue of
  the library's repository and a dependency of the row that needs it.
- Monorepo (`AGENTS.md` lists services): every row of the breakdown touches
  one service, named at the start of its Task (`[orders] ...`); work on two
  services is two rows.
- Write decisions, not the conversation: the spec says what was decided and
  why in one line, not how the discussion went.
- Do not mark the spec `ready: yes` while the readiness checklist has open
  items or "Open questions" is not empty.

## Rounds
1. **Goal.** Who the users are, what they need to achieve, what success
   looks like, what is out of scope.
2. **Flows.** The main user flows, step by step; edge cases and errors.
3. **Screens.** Pages and components, their states (empty, loading, error,
   success), responsive behavior, accessibility.
4. **Data and API.** Entities and fields the feature needs, the endpoints
   and their shapes. Draft the changes to `docs/api/` in the spec; backend
   applies them.
5. **Test seams.** The public interfaces the tests go through (an endpoint,
   a page, a module's interface): one line each on what the test there
   catches and what it misses. Prefer few, high seams. Agents in CI test
   there without asking.
6. **Breakdown.** The implementation tasks: role, what, depends on. A
   breaking contract change is planned as expand-contract (see `AGENTS.md`
   > API contract).
7. **Readiness.** Walk the checklist with the user; resolve or record every
   open question.

## Milestone session
`--milestone M0` designs every feature of that roadmap milestone together:
one session, one spec per feature. The rules and rounds above still apply,
with these differences:

- **Scope.** The features in the milestone's row of the roadmap
  (`docs/design/project.md`), matched by the milestone code (`M0` matches
  `M0 Foundations`). Skip those with a ready spec (say so; a revision is a
  session of its own) and resume those with `ready: no`. List the scope and
  ask for a yes before the first round; the user can drop features from it.
- **Draft first.** Before asking anything, write a draft spec for every
  feature from what is already decided: the roadmap's description of the
  feature, the decisions in `project.md`, the specs of earlier milestones, the
  code and `docs/api/`. Mark in each draft what is assumed and still to
  confirm. The questions are only about what this left open.
- **One round for all.** Each round covers every feature in scope, at most
  five questions per feature and twelve in total; number them across features
  and prefix each with its feature (`Q3 - auth-and-users: session length`).
  A decision that concerns several features is asked once, and recorded in
  each spec it affects. A feature whose questions are settled stops getting
  questions; the others continue.
- **Consistent breakdowns.** No work twice across specs: the API contract,
  a shared component or a migration is a row of one spec, the one that owns
  it. A row that needs a row of another spec writes it as `<feature>#<n>` in
  "Depends on" (`app-shell#2`); `create-issues` creates the other spec's issue
  first and links the two. Before readiness, show one table of every row of
  every spec in scope (feature, number, role, task, depends on).
- **Ready per spec.** Each spec gets `ready: yes` on its own, when its
  checklist is complete. The user can approve some and leave others open:
  "ok app-shell; auth-and-users: two roles". A spec that depends on one still
  open stays `ready: no`.
- **Commit.** The ready specs together, on a branch `design/<milestone>`
  (for example `design/m0`), with one merge request "design: M0 (<features>)".

## When the spec is ready
1. Set `ready: yes` and the date.
2. Commit the spec (and nothing else) on a branch `design/<feature>`, and
   open a merge request titled "design: <feature>". Locally without a
   remote, commit on that branch and tell the user to merge it.
3. Tell the user how the tasks get created: with a tracker (remote or custom
   scenario, or local with one), after the spec is merged, `python3 scripts/create-issues.py --dry-run` and
   then the same command without `--dry-run` create one issue per row of the
   breakdown, in the milestone of the roadmap (no labels; existing ones are
   skipped). The feature's "Design:" issue is reused: it becomes the task when
   the breakdown has one row, or the feature issue with the tasks as its
   sub-issues. With the orchestrator, it creates them after the merge;
   otherwise, list the tasks for the user to create.
4. With `--to-issues` (plugin skill `/agent-team:design-studio`), go on: after
   the merge, create the issues, split those that still need it, and stop
   before dispatch.
