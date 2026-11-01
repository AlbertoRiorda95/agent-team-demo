# Project: Orders

The back office of a small shop: staff see the orders, open one and change
its status (new, paid, shipped, cancelled). Amounts are in several currencies.

## Stack
- TypeScript everywhere, Node 24, npm.
- `apps/web`: React + Vite.
- `services/orders`: Fastify HTTP API, Postgres, Drizzle ORM and drizzle-kit
  migrations.
- `packages/money`: shared library (amounts, currencies, rounding,
  formatting), released on its own to GitHub Packages as
  `@albertoriorda95/money` on a `v*` tag.
- Tests: Vitest (unit and integration), Playwright (UI, `apps/web/e2e/`).
- Lint: ESLint + Prettier. Local environment: Docker Compose (Postgres and
  the services). No deployment target yet.
- npm workspaces at the root: `services/orders` and `apps/web` only.
  `packages/money` is a standalone npm project with its own lockfile: the
  service and the web app use it from the registry like any dependency,
  never through a local path or a workspace link.

## Commands
All from the repository root; the root scripts run every workspace and
`packages/money`.
- Install: `npm ci` (and `npm ci --prefix packages/money`)
- Build: `npm run build`
- Test: `npm test`; one package: `npm test -w services/orders`,
  `npm test -w apps/web`, `npm test --prefix packages/money`; one file:
  `npx vitest run <file>` from the package folder
- Lint: `npm run lint`; one file: `npx eslint <file>`
- Type check: `npm run typecheck` (`tsc -b`)
- Dev servers: `npm run dev -w apps/web` (port 5173),
  `npm run dev -w services/orders` (port 3000); Postgres with
  `docker compose up -d`
- API types: `npm run gen:api -w apps/web` (openapi-typescript from
  `services/orders/openapi.yaml` to `apps/web/src/api/schema.d.ts`)

## How work is delegated in this project
Route by file boundary, not by topic:
<!-- agent-team:if role_frontend -->
- `apps/web/` → frontend
<!-- agent-team:end -->
<!-- agent-team:if role_backend -->
- `services/orders/` (code, migrations, tests, `openapi.yaml`), `packages/money/` → backend
<!-- agent-team:end -->
<!-- agent-team:if role_designer -->
- `docs/design/`, UI review → designer
<!-- agent-team:end -->
<!-- agent-team:if role_devops -->
- `.github/workflows/`, `ci/`, `Dockerfile*`, `compose*.yml`, `.dockerignore`, `infra/` → devops
<!-- agent-team:end -->
<!-- agent-team:if role_optimizer -->
- Optimizing code that already works and is tested → optimizer
<!-- agent-team:end -->
<!-- agent-team:if role_writer -->
- `docs/software/`, the project `README.md` → writer (the software documentation; `docs/design/` stays the designer's)
<!-- agent-team:end -->

## Services
Each service has its folder and its contract; a task touches one service, and
its text starts with the service's name in brackets (`[orders] ...`).
| Service | Folder | Language | Contract |
|---|---|---|---|
| money | `packages/money/` | TypeScript library | its public API (`packages/money/src/index.ts`), semver, released on a `v*` tag |
| orders | `services/orders/` | TypeScript, Fastify | `services/orders/openapi.yaml` |
| web | `apps/web/` | TypeScript, React | consumes the orders contract |

A change of one service's contract that another service uses is an alignment
change ("Alignment changes"): the services that call it are the affected roles.
A change to `money` reaches orders and web only through a new release and a
version bump in their `package.json`: never import it by a relative path.

Two agents never edit the same file in the same round. If a task crosses
a boundary, split it into two tasks with an explicit dependency.

## Standard feature sequence
When you plan or lead a feature with several roles: read
`docs/agents/workflow.md` for the order of the roles. Involve only the
roles the task actually touches.

## Leading a session
Each role is an agent of the harness you use, pointing to its prompt in
`docs/roles/`:
<!-- agent-team:if harness_claude -->
- Claude Code: `.claude/agents/` (`@backend`, `@designer`...)
<!-- agent-team:end -->
<!-- agent-team:if harness_opencode -->
- OpenCode: `.opencode/agents/`
<!-- agent-team:end -->

When you lead (you are not one of the roles):
- Delegate by file boundary, as above, and only to the roles the task touches.
- After every delegation, check `docs/alignment/` for entries with
  `status: open` and handle them as in "Alignment changes": designer first,
  then the affected roles, then mark the entry resolved. Ask the user only
  when designer sets `decision-needed: yes`.
- Between tasks start a fresh session. Only when the session has grown long
  or changes phase (design to implementation, one task to the next), end your
  reply by suggesting that the user run `/handoff` (the handoff skill, in
  Codex) and then `/clear`. You cannot run it yourself and a short session
  does not need it: do not suggest it otherwise.

## On-demand roles
These roles are never part of the standard sequence. Delegate to them
only when the user asks explicitly.
<!-- agent-team:if role_optimizer -->
- optimizer: when the user asks for an optimization or a measurement shows
  a performance problem. Only with green tests.
<!-- agent-team:end -->
<!-- agent-team:if role_security -->
- security: when the user asks for a security assessment, typically once the
  application is complete or before a release. It reports findings; the
  owning roles fix them as separate tasks.
<!-- agent-team:end -->
<!-- agent-team:if role_writer -->
- writer: when the user asks for documentation of the application (design
  document, ICD, user manual, install guide, API guide), typically before a
  release. It writes only in `docs/software/` and the `README.md`; the
  reference from the code is generated by the CI (`ci/reference.sh`).
<!-- agent-team:end -->

## API contract
The contract between frontend and backend is `services/orders/openapi.yaml`
(OpenAPI 3.1). The web app generates its types from it with
openapi-typescript (`npm run gen:api -w apps/web`, output
`apps/web/src/api/schema.d.ts`).
- backend owns it and updates it before or together with the code.
- frontend generates its API types from it and never hand-writes response
  types, so a mismatch becomes a build error.
- Removing or renaming a field, changing a type, a status code or an error
  shape is a breaking change: it is always an alignment change and needs the
  user's approval in the MR.
- Prefer expand-contract to a breaking change. Expand: add the new field or
  endpoint next to the old one (not breaking). Migrate: move the callers, in
  their own tasks. Contract: remove the old form in a last task, once nothing
  uses it; only this step is breaking. `main` stays green at every step.

## Alignment changes
A change is an alignment change when another role relies on what you
changed: the API contract, the data model, a shared component or design
token, a route or user flow, an environment variable or port, the
deployment interface. When you make one, read and follow
`docs/agents/alignment.md` before opening the MR. Never adapt other
roles' code yourself.

<!-- agent-team:if team_tasks -->
## Team tasks
A team task (`agent:team`) is one issue across several roles done by one
agent alone, without delegating, with the responsibilities of every role it
touches: `docs/roles/team.md`. As the lead, delegate to `team` only when the
user asks for a team task.

<!-- agent-team:end -->
<!-- agent-team:if split -->
## Splitting issues
When you are asked to propose how to split an issue into task issues
(`agent:split`, `SPLIT_ISSUE`): read `docs/agents/splitting.md`.

<!-- agent-team:end -->
## Specs before code
Implementation tasks start from a spec in `docs/design/` marked `ready: yes`
(see `docs/design/_spec-template.md`). The project design is
`docs/design/project.md`.
- If the task has no spec, the spec is not ready, or it does not cover what
  you are asked to do: stop, write what is missing in the issue or in your
  final message, and do not invent the missing design.
- Large design work happens in a studio session with the user
  (`docs/roles/design-studio.md`), not in MR comments. MR comments are code
  review.

## Reuse before writing
Before writing something generic or adding a dependency: what the project
already has, then the team's libraries (`docs/general/libraries.md`), then a
trusted library; read `docs/agents/dependencies.md`. Never install a package
name from memory, and never change a team library from this repository.

## Branches and merge requests
One branch per task. Before opening or updating an MR: read
`docs/agents/merge-requests.md` (branch name, update from `main`,
description sections).

## CI
A red CI is part of your task: fix the cause, never weaken a check (no
edits to `ci/scanners.env`, skipped tests or ignore rules without the
user's approval in the MR). When a check fails, or when you touch tests,
UI screens, workflows or CI files: read `docs/agents/ci.md`.

## Rules for everyone
- Small commits, messages in English, imperative mood.
- Nobody pushes to `main`. Nobody merges. Nobody closes an issue.
- If a requirement is ambiguous, stop and ask; do not guess.
