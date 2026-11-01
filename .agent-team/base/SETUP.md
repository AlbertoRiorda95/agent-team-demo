# SETUP.md — instructions for the agent session that configures this template

You are setting up the **agent-team template** for a new project. The template
defines a team of agents: designer, frontend, backend and devops for everyday
work, optimizer, security and writer (the documentation) that run only on
explicit request,
plus the rules, hooks, workflows and gateway they need. It ships with
placeholder values written for a React + Node + Postgres app on GitHub; your
job is to replace them with the user's real project data.

If the user asked you to "read SETUP.md" or "set up this project", follow this
file from top to bottom, whether you run in Claude Code, OpenCode or Codex. Talk to
the user in the language they use; keep every file you write in English.

The setup has these parts:
1. **Configuration** (required): the interview, the edits, the checks (sections below up
   to "After editing: checks").
2. **Project design** (required): a design studio session that produces
   `docs/design/project.md` with `ready: yes`, unless it already exists. The
   setup is not finished without it: the team only implements what a ready
   spec describes.
3. **Foundations**, in a new repository only: the spec of a walking skeleton
   (`docs/design/foundations.md`), derived from the first two parts and
   implemented as the first task.

## Ground rules

1. **Ask, don't guess.** Every value below comes from the user or from files
   that already exist in the repository. If an answer is missing or vague, ask
   again or propose a default and wait for confirmation.
2. **Read before asking.** If the repository already contains code (for example
   `package.json`, `pyproject.toml`, `go.mod`, `pom.xml`, `Cargo.toml`,
   `CMakeLists.txt`, `conanfile.*`, `Dockerfile`, `.github/workflows/`,
   `.gitlab-ci.yml`), inspect it first and turn your findings into proposals the
   user only has to confirm.
3. **One topic per round.** Ask the questions of one block at a time (blocks
   A–H below, with F2), at most five questions per round, then summarize what you
   understood before moving on.
4. **No edits until the summary is approved.** Collect all answers, show the
   complete plan of changes (file by file), get an explicit "yes", then edit.
5. **Never write secrets.** API keys and tokens go into the platform's secrets
   or into `infra/litellm/.env`, never into a tracked file. Only write the
   *names* of the secrets.
6. **Keep the files consistent.** The same folder names, commands and roles
   appear in several files; the "Where each answer goes" table lists them all.

## The interview

### A. Project
- Project name and a one-line description.
- Is this a new repository or an existing codebase?
- Git platform: GitHub, GitLab or other? Repository owner/name.
- Your username on that platform (for `CODEOWNERS`).

### B. Stack
- Languages and versions (for example TypeScript 5 / Node 22, Python 3.12,
  C++20, Go 1.23).
- Frontend framework, if any (React, Vue, Svelte, Angular, Qt, none…).
- Backend framework (Express, NestJS, FastAPI, Django, Spring, none…).
- Database and migration tool (Postgres + Prisma, MySQL + Flyway, SQLite…).
- Package manager and build system (npm, pnpm, poetry, uv, CMake + Conan…).
- Containers and deployment target (Docker/Podman, Kubernetes + Helm,
  Terraform, a PaaS, nothing yet).

### C. Commands
Ask for the exact command lines:
- install dependencies
- build
- run tests (all), and run a single test file if different
- lint / format, and lint a single file (used by `lint-frontend.sh`)
- start the dev server, with its port
- any type check or static analysis step

### C2. CI
The project CI (`.github/workflows/ci.yml`, `.gitlab/ci/ci.yml`) is written
for npm. Fill it in from the answers to B and C, or from what you find in the
repository (an existing CI is a source too: keep its steps):
- toolchain: the setup action on GitHub (`actions/setup-node`,
  `setup-python`, `setup-java`, `setup-go`...) and the image on GitLab;
- install, lint, type check, build and test commands; the lockfile used as
  cache key; every job that installs dependencies keeps
  `./ci/registry.sh login` (with its `env:`) right before the install
  command, whatever the stack (`npm ci`, `pip install`, `mvn`, `gradle`,
  `conan install`...), and so do `agents.yml` and the publish job (D4);
  without a type check command, propose one (`tsc --noEmit`,
  `mypy`, `pyright`...) or remove the step;
- the semgrep rulesets of the stack's languages in `ci/scanners.env`
  (`SEMGREP_CONFIG`, for example `p/ci p/typescript` or `p/ci p/python`);
- the install command of the `sbom-licenses` job: dependencies must be
  installed there (without running their scripts when the tool allows it),
  because license data come from them;
- a web UI: rename `playwright.config.ts.example` and `e2e/ui.spec.ts.example`
  (drop `.example`), set the command that serves the built app and its port,
  add `@playwright/test` and `@axe-core/playwright` to the dev dependencies of
  the web package, and move both files there if the web app is a workspace
  (then set `working-directory` or `-w` in the `ui` job and its artifact path),
  and exclude `e2e/` from the unit test runner: Vitest and Jest would
  otherwise pick up the `*.spec.ts` files and fail on them;
- a Dockerfile: on GitHub the image is built and scanned automatically; on
  GitLab ask whether to build and push it to the project registry and scan it.
Ask about the policies in `ci/scanners.env`: vulnerability threshold (default
`high`), license categories that fail the build (default `CRITICAL`, i.e.
forbidden licenses such as AGPL; add `HIGH` to block restricted ones such as
GPL), and whether some licenses must be moved between categories (a
`trivy.yaml` with a `license:` section).

### D. Folder layout
For each role, the folders it owns. Propose the defaults below, adjusted to
what you found in the repository, and ask the user to confirm or correct:

| Role | Default folders |
|---|---|
| frontend | `src/ui/`, `src/components/`, `src/styles/`, `src/api/` (client layer) |
| backend | `src/server/`, `migrations/`, `tests/integration/` |
| designer | `docs/design/` (specs only, no code) |
| devops | `.github/workflows/` or `.gitlab-ci.yml`, `Dockerfile*`, `compose*.yml`, `deploy/`, `charts/`, `infra/`, `Makefile` |
| optimizer | no folder of its own: works on tested code anywhere, on request |
| security | writes only `docs/security/`; reads everything, on request |
| writer | writes only `docs/software/` and the project `README.md`; reads everything, on request |

Also ask:
- Where the design tokens live (default `src/styles/tokens.css`), or whether
  there is no design system yet.
- Which paths are critical and need the user's review (default:
  `migrations/`, `src/server/auth/`, `.github/`, `.claude/`, `.opencode/`,
  `infra/`, `deploy/`).
- Whether to keep the security role and, if so: the staging host it may
  test besides `localhost` (never production), and which security tools are
  installed or should be (semgrep, OWASP ZAP, nuclei, the stack's dependency
  audit such as `npm audit` or `pip-audit`).
- Whether any role is not needed (for example no frontend in a CLI tool, no
  designer in a backend service). A removed role must disappear from every
  file in the table below.

### D1. One application or several services
Ask whether the repository holds one application or several services or
subsystems (a monorepo: `services/orders/`, `services/billing/`, a shared
`libs/`...). With several:
- list each service with its folder, its language and its contract, and
  fill the `## Services` table in `AGENTS.md` (remove the comment around it);
- the role boundaries become per service: `docs/roles/<role>.md` →
  `## Boundaries` (for example backend: `services/*/src/`, `services/*/migrations/`),
  the routing lines of `AGENTS.md`, `.github/CODEOWNERS` per service folder;
- the issues: every task row and split task starts with its service
  (`[orders] Add the endpoint`); dispatch then runs one task per role and per
  service (`--per-role` counts per service) and a task without a service
  waits for all of them;
- the CI builds and tests only what changed: a job per service with path
  filters (GitHub: `paths` or a matrix built from the changed folders;
  GitLab: `rules: changes:`), or the monorepo tool the project uses (Nx,
  Turborepo, Gradle, Bazel, Go workspaces). The security scans stay on the
  whole repository.
Services in separate repositories are not supported yet: set up each as its
own project.

### D2. API contract
- Where does the contract between frontend and backend live? OpenAPI file
  (default `docs/api/openapi.yaml`), shared TypeScript types or schemas, a
  GraphQL schema, protobuf files, or nothing yet (then propose creating
  `docs/api/openapi.yaml` from the existing routes).
- How does the frontend generate its types from it (for example
  `openapi-typescript`, `orval`, a codegen script)? If there is no generator
  yet, propose one and add the command to `## Commands`.
- Which changes count as breaking for this project (the default list is in
  `AGENTS.md` → API contract).

### D3. Reuse: the team's libraries
Ask whether the team has libraries of its own that this project should use
(give a GitHub/GitLab link for each). For each: what it is for, how to get it
(a package registry and the package name; a Git dependency at a tag when
there is no registry; a submodule only to build it from source), the
version range, where its documentation is. Write them in
`docs/general/libraries.md`.

The registry connection is `ci/registry.sh`, the same in every CI job, in
the release job and on a laptop; set it up in `ci/registry.env`:
`REGISTRY_KIND` (the package manager, see D4), `REGISTRY_URL` (empty: no
team registry), the npm scope or the id of the Maven server, Gradle
repository or Conan remote. No token goes in a committed file: the script
reads it from the environment and writes it into the package manager's
user-level configuration.
- **Read** (every job that installs dependencies runs `ci/registry.sh login`,
  C2): on GitHub Packages or GitLab's package registry of the same
  organization the job token is enough (`GITHUB_TOKEN` with
  `packages: read`, which `ci.yml` grants; `CI_JOB_TOKEN`, after adding this
  project to the library project's job token allowlist). Otherwise create a
  **read-only** token and store it as `REGISTRY_TOKEN`: a repository secret on
  GitHub, a masked variable on GitLab.
- **Locally**: each person exports their own `REGISTRY_TOKEN` and runs
  `./ci/registry.sh login` once; agents in a local session use it through
  the package manager and cannot read the files it writes (denied in
  `.claude/settings.json`).
- **Dependabot**: a `registries:` entry in `.github/dependabot.yml` with
  `token: ${{secrets.DEPENDABOT_REGISTRY_TOKEN}}`, a Dependabot secret
  (Settings > Secrets > Dependabot: Actions secrets are not visible to it).
  Dependabot has no Conan support.

No libraries: leave the file with its example removed, saying "none yet".

### D4. Publishing: this project as a package
Ask whether this project is itself a package other projects use (a library,
an SDK, a shared component). If yes, set `PUBLISH_PACKAGE=yes` and make sure,
whatever the stack, that there is a step that uploads it, and one that
installs it on this machine when there is no registry:

| Stack | `REGISTRY_KIND` | `publish` (to `REGISTRY_URL`) | `local` (this machine) |
|---|---|---|---|
| Node | `npm` | `npm publish` | `npm pack` into `LOCAL_REPOSITORY` |
| Python | `pypi` | `python -m build`, `twine upload` | wheel into `LOCAL_REPOSITORY` (`pip install --find-links`) |
| Java, Maven | `maven` | `mvn deploy` (`distributionManagement` with the server id) | `mvn install` (`~/.m2`) |
| Java/Kotlin, Gradle | `gradle` | `gradle publish` (`maven-publish`, the repository named `REGISTRY_ID` with `credentials(PasswordCredentials)`) | `gradle publishToMavenLocal` |
| C/C++, Conan 2 | `conan` | `conan create`, `conan upload` to the remote `REGISTRY_ID` (Artifactory, Nexus, GitLab; not GitHub Packages) | `conan create` (Conan's cache) |
| anything else (cargo, Go, NuGet, Helm...) | `custom` | `PUBLISH_COMMAND` | `LOCAL_COMMAND` |

For `custom`, write the commands in `ci/registry.env` (`LOGIN_COMMAND`,
`PUBLISH_COMMAND`, `LOCAL_COMMAND`): they read the token from
`$REGISTRY_AUTH_TOKEN`, never print it, and write it only in the user-level
configuration. Add the tool's publish command to the blocked list of
`scripts/hooks/block-infra-commands.sh`, `.codex/rules/agent-team.rules` and
the `deny` of OpenCode, and its credential file to the `Read(...)` denials
of `.claude/settings.json`.

Then, from the scenario (F):
- **With a remote CI**: `publish.yml` (GitHub) and the `publish` job
  (GitLab) run on a `v*` tag in the `release` environment; set their
  toolchain, install and test commands as in C2. A token with write access
  goes there only, as `REGISTRY_PUBLISH_TOKEN`: an environment secret of
  `release` on GitHub, with a required reviewer and the deployment limited to
  `v*` tags; a protected, masked variable scoped to `release` on GitLab, with
  `v*` as protected tags. On the platform's own registry the job token
  publishes and no secret is needed.
- **Local, or no registry**: the release is `git tag vX.Y.Z` and
  `./ci/registry.sh local`, run by the user; the projects that use the
  package take it from the local repository (`~/.m2`, Conan's cache,
  `LOCAL_REPOSITORY`). With a registry, the user can also publish from their computer:
  `REGISTRY_PUBLISH_TOKEN=... ./ci/registry.sh publish`.

Agents never publish and never push tags (hooks and permission rules of
every tool): the user pushes the tag, or runs the command.

### E. Design system
- Brand colors, fonts, spacing scale, base components, breakpoints.
- If the user has none yet, keep the template's generic tokens and say so.

### F. Scenario
How will the team work? Explain the three scenarios in a few lines and ask:
- **Local**: the agents run in the user's session, on their computer, with
  Claude Code, Codex or OpenCode. Fastest start; the user must be there while
  the agents work.
- **Remote repository**: the agents run in GitHub Actions or GitLab CI,
  started from issues (a label or a pipeline); the user reviews the merge
  requests later. Needs secrets, labels and branch protection.
- **Custom orchestrator**: the issues live in another tracker (Jira, Linear,
  Redmine) or the agents run on the user's infrastructure (Multica, or an
  orchestrator they write), started by a command (`start_command`).

For the remote scenario also ask: Claude Code with an API key or a
subscription token (`ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`), Codex
(`OPENAI_API_KEY`), OpenCode (which providers and models: the exact model IDs
as the provider documents them, or LiteLLM)? And whether they want team tasks
(`agent:team`: one agent does a whole issue across several roles, without
subagents, one MR: `docs/roles/team.md`).

For the remote and custom scenarios also ask where the issues live. GitHub or
GitLab need nothing more. For local files, Jira, Linear or Redmine read
`docs/general/trackers.md` and ask for the tracker's address and project,
and how tasks should start: a command (an orchestrator) or by hand. Secrets
are environment variables, never files.

With LiteLLM (OpenCode on several providers) ask: direct keys in the platform
secrets, LiteLLM on a server (domain name?), or a hosted gateway.

### F2. Profile: tools, CI, tracker, roles, features
The answers decide which files stay. Everything else is removed before you
edit (`scripts/agent-team.py prune`), so you customize only what the project
uses and no agent reads instructions for tools it does not have. Nothing is
lost: a later profile change plus the template upgrade brings it back.
- **Harnesses**: which tools people and CI will use: Claude Code, OpenCode,
  Codex, one or more. The first one leads: it runs every role that is not
  assigned to another. Default: the one running this setup.
- **Role runners**, only with more than one harness: which roles run on which,
  for example frontend on OpenCode (`"runners": {"frontend": "opencode"}`; on
  GitHub also the `AGENT_RUNNERS` variable, see `agents.yml`).
- **CI platform**: `github`, `gitlab`, `both` (rare) or `none`.
- **Tracker**: from block F (`github`, `gitlab`, `local`, `jira`, `linear`,
  `redmine`, or `none` for no issues at all).
- **Roles**: the seven by default; drop those the project does not need
  (designer without a UI, security with nothing to attack yet).
- **Features**: `ci-agents` (agents started from issues in CI: the remote
  scenario), `team-tasks` (the `team` agent and the `agent:team` label),
  `split` (split proposals in CI, with Claude Code),
  `dispatch` (start ready tasks at every merge), `spec-sync` (update the
  issues when a spec change reaches the main branch: a CI job on GitHub or
  GitLab, a Git hook locally), `litellm` (the gateway in `infra/litellm/`).

The profile goes into `.agent-team/config.json`, together with the tracker
settings of block F, for example:

```json
{
  "harnesses": ["claude", "codex"],
  "runners": {"optimizer": "codex"},
  "ci": "github",
  "tracker": "github",
  "roles": ["designer", "frontend", "backend", "devops", "optimizer", "security", "writer"],
  "features": ["ci-agents", "split", "dispatch"]
}
```

### G. Models and effort
Propose the defaults and ask only whether to change them:

| Role | model | effort |
|---|---|---|
| designer | sonnet | medium |
| frontend | sonnet | medium |
| backend | opus | high |
| optimizer | opus | high |
| devops | opus | high |
| security | opus | high |
| writer | sonnet | medium |

### H. Skills
`scripts/install-skills.sh` installs skills written for React, Postgres and
GitHub Actions. Show the list and ask which ones fit the stack:

| Skill | Fits when | Used by |
|---|---|---|
| frontend-design, web-design-guidelines | there is a web UI | designer |
| vercel-react-best-practices | React / Next.js | frontend, optimizer |
| webapp-testing | there is a web UI | frontend |
| tdd, diagnosing-bugs | always | frontend, backend |
| supabase-postgres-best-practices | Postgres | backend, optimizer |
| api-design-principles | there is an HTTP API | backend |
| clean-architecture (shipped in the template, nothing to install) | the backend is in a language and framework that let you layer the code (TypeScript, Java, Kotlin, C#, Python, Go, PHP...) and has real business rules, not only CRUD over a database | backend (preloaded) |
| security-review | always | security (preloaded), backend (on demand) |
| code-simplifier | always | optimizer |
| gha-security-review, github-actions-templates | GitHub Actions | devops |

If the clean-architecture row does not fit (no backend, a script, a framework
that imposes its own structure, a thin CRUD), delete
`.claude/skills/clean-architecture/` and `.agents/skills/clean-architecture/`,
and its line in `skills:` of `.claude/agents/backend.md`, and the clean
architecture rule in `docs/roles/backend.md`. If it fits, set the folder names
in the skill to the stack's.

For a stack the list doesn't cover, offer to search with `npx skills find
"<topic>"` and propose at most one or two skills per role: every installed
skill adds its description to every session.

## Where each answer goes

| Answer | Files to update |
|---|---|
| Profile (do this first) | write `.agent-team/config.json`; run `python3 scripts/agent-team.py prune --dry-run`, show the list, then `python3 scripts/agent-team.py prune` (add `--yes` when there is no `.agent-team/manifest.json`, that is in a plain copy of the template). The rows below then apply only to the files that remain |
| Project name, description | `AGENTS.md` (title), `README.md` (title and first paragraph: rewrite it for the project) |
| Stack | `AGENTS.md` → `## Stack` |
| Commands | `AGENTS.md` → `## Commands`; `docs/roles/frontend.md` (lint/test line); `scripts/hooks/gate-test.sh` (test command); `scripts/hooks/lint-frontend.sh` (file extensions and single-file linter); `.gitlab-ci.yml.example` (image, install steps) |
| Folder layout | `AGENTS.md` → `## How work is delegated`; `docs/roles/*.md` → `## Boundaries` of each role; `.github/CODEOWNERS`; `.claude/settings.json` → `Read(...)` deny rules for secret paths |
| Token location | `docs/roles/designer.md`, `docs/roles/frontend.md`, `.claude/skills/design-system/SKILL.md` |
| Clean architecture | `.claude/skills/clean-architecture/SKILL.md` and its copy in `.agents/skills/` (folder names), or remove it as in step H |
| Design system | `.claude/skills/design-system/SKILL.md` (rewrite; keep it under ~60 lines) |
| Removed role | delete `docs/roles/<role>.md`, `.claude/agents/<role>.md`, `.opencode/agents/<role>.md`; remove it from `AGENTS.md` (on-demand roles) and `docs/agents/workflow.md` (sequence), `CLAUDE.md`, `scripts/create-labels.sh`, the model expression in `.github/workflows/agents.yml`. For writer also delete `scripts/hooks/writer-writes.sh`, `docs/software/` and the `document` skill (`.claude/skills/document/`, `.agents/skills/document/`). For security also delete `scripts/hooks/security-*.sh`, `docs/roles/security-scope.txt`, `docs/security/` and the matching `.gitignore` lines |
| Username | `.github/CODEOWNERS` |
| CI | `.github/workflows/ci.yml` and `.gitlab/ci/ci.yml` (toolchain, commands, cache key, build output); `ci/scanners.env` (policies); `trivy.yaml` only if license categories change |
| API contract | `AGENTS.md` → `## API contract` (path and generator); `docs/api/README.md`; `docs/roles/frontend.md` and `docs/roles/backend.md` if the wording differs; `.github/CODEOWNERS` (add the contract path) |
| Commands allowed in CI | `--allowedTools` in `.github/workflows/agents.yml` and `claude.yml` (replace `Bash(npm:*)`, `Bash(npx:*)` with the stack's tools), `.gitlab-ci.yml.example` |
| Reference generators | `ci/reference.sh` (keep the generators of the stack, add the missing one) and `ci/scanners.env` (versions, `PYTHON_PACKAGE`); the `reference-docs` job of `.github/workflows/ci.yml` and `.gitlab/ci/ci.yml` (toolchain, dependency install); the dev dependency the generator needs (typedoc, for example) |
| Wanted documents | `docs/software/README.md` (the list the writer writes) |
| Services (monorepo) | `AGENTS.md` → `## Services` and the routing lines; `docs/roles/*.md` → `## Boundaries`; `.github/CODEOWNERS`; the CI jobs (path filters per service) |
| Team libraries | `docs/general/libraries.md`; `ci/registry.env`; the committed registry file of the stack, without tokens (`.npmrc` with the scope, `pom.xml` repository ids, the Gradle repository, the Conan remote's name); `REGISTRY_TOKEN` on the platform; `.github/dependabot.yml` |
| Publishing | `ci/registry.env` (`REGISTRY_KIND`, `PUBLISH_PACKAGE`, the `custom` commands); the toolchain and commands of `.github/workflows/publish.yml` and of the `publish` job in `.gitlab/ci/ci.yml`; `REGISTRY_PUBLISH_TOKEN` in the `release` environment and the protected `v*` tags; for `custom`, the publish command in the blocked lists and its credential file in the `Read(...)` denials |
| Security scope and tools | `docs/roles/security-scope.txt` (one host per line, never production); the dependency-audit command in `docs/roles/security.md` → `## What you check` item 6 |
| Scenario | see "Profiles by scenario" below |
| Automatic start of ready tasks | optional: keep `.github/workflows/dispatch.yml` and `scripts/dispatch.py`; to turn it on set the `AGENT_AUTODISPATCH` variable and the `AGENT_DISPATCH_TOKEN` secret (see the workflow header); otherwise remove the workflow and start tasks by hand or with `python3 scripts/dispatch.py` |
| Issue tracker, starter | `.agent-team/config.json` (`tracker`, `starter`, `start_command`, the tracker's section; see `docs/general/trackers.md`); nothing for GitHub and GitLab, which are detected. With another tracker and no GitHub/GitLab agents, remove `.github/workflows/split.yml`, `dispatch.yml` and the split jobs of `.gitlab/ci/agents.yml` |
| Issue split in CI | keep `.github/workflows/split.yml`, `scripts/split-issue.py` and `agent:split` in `scripts/create-labels.sh`, or the `claude-split` and `split-create` jobs in `.gitlab/ci/agents.yml` (they need the `GITLAB_ACCESS_TOKEN` variable); if not wanted, remove them and the `## Splitting issues` section of `AGENTS.md` and `docs/agents/splitting.md` |
| Subscription token | `.github/workflows/*.yml`: replace `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}` with `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` |
| Non-Claude roles, providers | `.github/workflows/agents.yml` (secrets in `env`, `model:` expression), `opencode.json`, `.opencode/agents/` (one file per non-Claude role, permissions as in the existing ones), `infra/litellm/litellm-config.yaml`, `infra/litellm/docker-compose.yml`, `infra/litellm/.env.example` |
| LiteLLM domain | `infra/litellm/Caddyfile`, `infra/litellm/create-key.sh`, `opencode.json` (`baseURL`) |
| Models and effort | Claude Code: `model:` and `effort:` in `.claude/agents/*.md` and the `--model` expression in `.github/workflows/agents.yml`; Codex: `model_reasoning_effort` in `.codex/agents/*.toml`, `model` in `.codex/config.toml`, the `CODEX_MODEL` variable in CI; OpenCode: `model:` in `.opencode/agents/*.md` or `OPENCODE_MODEL` in CI |
| Skills | `scripts/install-skills.sh`; the `skills:` list and the closing note of each `.claude/agents/*.md`; the skill names in `CLAUDE.md` |
| No web UI | remove the `playwright` MCP server from `.claude/agents/designer.md` (or the designer role) and the frontend lint hook if there is no frontend |

Placeholders that are *not* marked `CUSTOMIZE` but still depend on the stack:
`src/...` paths and `npm` commands inside `docs/roles/*.md` and `AGENTS.md`,
`tokens.css`, the deny list in `.claude/settings.json`, the `npm test*` /
`npm run lint*` permissions in `.opencode/agents/*.md`.

## Profiles by scenario

Use the table to propose the profile of block F2; `scripts/agent-team.py prune`
then removes the files, so there is nothing to delete by hand.

| Scenario | Profile |
|---|---|
| Local | the tool(s) used locally; `ci` of the project CI; `tracker` `none` or `local`; `spec-sync` with a tracker if wanted (then link `scripts/git-hooks/spec-sync.sh` as the `post-merge` and `post-commit` hooks, after checking `.git/hooks/` has none of the user's). |
| Remote repository | one or more tools (the first leads, `runners` for the others); `ci` and `tracker` the same platform; `ci-agents` plus `team-tasks`, `split`, `dispatch`, `spec-sync` as wanted; `litellm` for OpenCode through a gateway |
| Custom orchestrator | the tools the orchestrator runs; the tracker of its intake; `starter: command` with `start_command` (`docs/general/trackers.md`); the orchestrator runs `scripts/create-issues.py` after merging a change to `docs/design/`; `litellm` if it routes models through the gateway |

After pruning, by hand: on GitLab rename `.gitlab-ci.yml.example` to
`.gitlab-ci.yml` and move `.github/CODEOWNERS` to `.gitlab/CODEOWNERS` if it is
still there.

## After editing: checks

Run these and fix anything that fails before reporting:

```bash
grep -rn --exclude=SETUP.md "CUSTOMIZE\|<name>\|<model>\|<version>\|your-username\|your-domain" .   # only what you left on purpose
claude plugin validate .claude/agents      # Claude Code: agent frontmatter loads
bash -n scripts/hooks/*.sh scripts/*.sh infra/litellm/*.sh ci/*.sh 2>/dev/null
chmod +x scripts/hooks/*.sh scripts/*.sh infra/litellm/*.sh 2>/dev/null
python3 -c "import json; [json.load(open(f)) for f in ['.claude/settings.json','.mcp.json']]"
echo '{"tool_input":{"command":"terraform apply"}}' | ./scripts/hooks/block-infra-commands.sh; echo "exit $? (must be 2)"
./scripts/hooks/alignment-check.sh; echo "exit $? (must be 0: no open entries yet)"
./ci/registry.sh local   # with PUBLISH_PACKAGE=yes: the package builds and installs on this machine
grep -q '^ready: yes' docs/design/project.md && echo "project design ready" || echo "project design NOT ready"
# with the security role:
echo '{"tool_input":{"command":"curl https://example.com"}}' | ./scripts/hooks/security-scope.sh; echo "exit $? (must be 2)"
echo '{"tool_input":{"command":"curl http://localhost:3000/api"}}' | ./scripts/hooks/security-scope.sh; echo "exit $? (must be 0)"
# with Claude Code: the role checks apply to the role's agent only (role-hooks.sh reads agent_type)
echo '{"agent_type":"security","tool_name":"Bash","tool_input":{"command":"curl https://example.com"}}' | ./scripts/hooks/role-hooks.sh pre; echo "exit $? (must be 2)"
echo '{"tool_name":"Bash","tool_input":{"command":"curl https://example.com"}}' | ./scripts/hooks/role-hooks.sh pre; echo "exit $? (must be 0: the lead session)"
# Codex, if in the profile (with the codex CLI installed):
codex execpolicy check --rules .codex/rules/agent-team.rules -- git push --force   # must match a forbidden rule
python3 -c "import tomllib,glob; [tomllib.load(open(f,'rb')) for f in ['.codex/config.toml', *glob.glob('.codex/agents/*.toml')]]"
# OpenCode, if in the profile (with the opencode CLI installed):
opencode agent list   # the roles you kept appear, with mode all
python3 scripts/agent-team.py prune --dry-run   # must say: Nothing to prune
```

If the network allows it, run the CI security steps once locally: they
install their own tools in `~/.local/bin` and write to `reports/`:

```bash
./ci/install-scanners.sh && ./ci/scan.sh sbom-licenses && ./ci/scan.sh vulnerabilities
```

Validate the YAML files you changed (workflows, LiteLLM config) with any YAML
parser available. Keep `<version>` placeholders only where the user chose to
pin versions later, and list them in the report.

## Install the skills

Skills are third-party code that runs with the agents' permissions, so they
are installed only after the user confirms.

1. Show the final list from block H: each skill, the repository it comes from,
   and the agents that preload it. Ask: "Install these skills now?" If the
   answer is no, add `./scripts/install-skills.sh` to the open items of the
   report and move on.
2. Run `./scripts/install-skills.sh`. If it fails because there is no network
   or no `npx`, say so, add it to the open items and move on: do not retry
   with other tools or download the skills another way.
3. Run `./scripts/check-skills.sh`. It fails when an agent's `skills:` field
   names a skill that is not installed (a typo there gives no error at run
   time: the agent just starts without the skill), and it lists the scripts
   the installed skills contain. Fix the names, or remove the skill from the
   agent, until it passes. Show the user the list of scripts and suggest
   reading them before the first real task.
4. If the repository is a Git repository, commit `.claude/skills/` (and `.agents/skills/`) and
   `skills-lock.json` in a commit of their own ("Add agent skills"), separate
   from the configuration, so the skills can be reviewed and reverted alone.

## Project design (required)

The agents implement only what a ready spec describes (`AGENTS.md` > Specs
before code), so the project needs its design before the first task. Tell the
user this step is part of the setup, not an optional extra.

1. **If `docs/design/project.md` exists with `ready: yes`:** read it, check it
   against the interview answers (stack, roles, contract) and report any
   difference. This part is done.
2. **Otherwise, run a design studio session for the project.** Follow
   `docs/roles/design-studio.md`, with `docs/design/_project-template.md` as
   the template and `docs/design/project.md` as the running draft. In an
   existing codebase, first draft it from the code (routes, models, pages,
   README) and ask the user to confirm and complete it instead of starting
   from zero. Rounds:
   1. product, users and their roles, out of scope;
   2. core flows, with their error cases;
   3. screens and main components;
   4. domain model;
   5. API surface: write the first version of the contract in the format
      chosen in D2 (default `docs/api/openapi.yaml`);
   6. integrations and non-functional requirements (performance, security
      and privacy, accessibility, devices, languages);
   7. design direction: update `.claude/skills/design-system/SKILL.md` with
      what was decided;
   8. roadmap: milestones and their features, one future spec each.
3. Set `ready: yes` only when "Open questions" is empty and the user confirms.
4. Commit the project design, the contract and the design-system skill in a
   commit of their own, separate from the configuration.

The user can skip this only by saying so explicitly ("skip the project
design"). Then create `docs/design/project.md` from the template with
`ready: no` and the line `skipped: <date>, by the user`, and tell them
clearly that no implementation task can start until it is ready: they can
resume any time with `/design-studio project`.

## Foundations (new repositories)

Before the first feature, the project needs a walking skeleton: the folder
structure, the services that start, the contract served, the database
reachable, the tests running, the CI green. Without it the first feature task
also builds the scaffolding, the MR gets too large, and roles that work in
parallel collide on shared files (dependencies, compose, test config).

**When:** only if the repository does not yet contain code that builds and
passes its tests. In an existing codebase skip the spec: just check that the
API served matches the contract file and that the CI commands from block C2
work, and report the gaps as open items.

**How:** this is not a second studio session. Almost everything comes from
the interview and `docs/design/project.md`.

1. Create `docs/design/foundations.md` from `docs/design/_spec-template.md`
   and fill it in from what you already know:
   - Goal: "a skeleton that builds, starts and passes CI, with no product
     feature"; Out of scope: any business logic;
   - folder structure per role (block D) and the tooling (blocks B, C);
   - backend: the app starts and serves every endpoint of the contract with
     placeholder responses, so the API it exposes matches the contract file;
     configuration read from the environment (for example `DATABASE_URL`);
   - database: connection, migration tool, first empty migration, a test
     database for CI;
   - frontend, if any: the app starts, one placeholder page, the API client
     types generated from the contract;
   - tests: one smoke test per side, wired to the commands in `AGENTS.md`,
     and, with a web UI, the Playwright UI tests of the placeholder page;
   - local environment: how to start everything (for example `compose.yml`),
     ports, the `.env.example` variables;
   - Screens and states: "not applicable" except the placeholder page;
   - Acceptance criteria: observable checks, for example "`<test command>`
     passes", "the served OpenAPI equals `docs/api/openapi.yaml`", "CI is
     green on the MR";
   - front matter: `milestone:` the first roadmap milestone (the foundations
     milestone, usually M0) and `features:` the roadmap features of that
     milestone this spec implements, comma-separated. `create-issues.py` uses
     them to put the foundations tasks in that milestone instead of
     creating "Design:" issues for the same work;
   - Task breakdown: backend, then frontend, then devops (CI and compose).
2. Ask only what is still open (at most one round), then set `ready: yes`
   when the user confirms.
3. Commit the spec on its own. Do not write the skeleton code here: it is
   the first implementation task.

## Issues from the roadmap (remote and custom scenarios)

When the team takes its tasks from the platform's issues (the remote scenario; F too, if its intake is GitHub or GitLab), turn the roadmap into issues
with `scripts/create-issues.py`: one native milestone per roadmap milestone
(GitHub and GitLab milestones, not issues) and, in it, the task issues of
every ready spec (the foundations first) and one "Design: <feature>" issue for
every feature that has no spec yet. Sub-issues are left for the split of a
single task (AGENTS.md > Splitting issues). It adds no labels, so nothing
starts until the user adds `agent:<role>` to a task.

1. Check the tracker: `python3 scripts/tracker.py check`. For GitHub and
   GitLab that means the remote and an authenticated `gh` or `glab`; for
   the others the configuration and the environment variables of
   `docs/general/trackers.md`.
2. **If both work:** run `python3 scripts/create-issues.py --dry-run` and show
   the plan. On the user's yes, run it without `--dry-run`.
3. **Otherwise** (no remote yet, no CLI, not authenticated): create nothing
   and add to the open items, in this order: create the repository and push,
   authenticate `gh`/`glab` (or set the tracker's variables), then `python3 scripts/create-issues.py --dry-run`
   and the same command without `--dry-run`.

The script skips titles that already exist and never closes anything, so it is
safe to run again after every design studio session; it lists the issues it
created earlier that are no longer in the plan. When a feature's spec becomes
ready, its "Design:" issue is renamed into the task (one row) or into the
feature issue with the tasks as sub-issues (several rows).

## Report to the user

End with:
1. the answers you used, in a short table;
2. the files changed, created and deleted;
3. what is still open (versions to pin, secrets to create, labels to run,
   branch protection to enable, the CI as a required check on `main`), as a checklist;
4. a reminder that optimizer, security and writer run only on request, that a
   security assessment is best run once the application is complete, and that
   `/document` writes the software documentation (`docs/software/`) while the
   CI builds the reference from the code;
   on GitHub, a reminder to enable branch protection on `main` with "Require
   branches to be up to date before merging" and to run
   `./scripts/create-labels.sh` (it also creates `alignment-needed`); on
   GitLab, to create the `alignment-needed` label and to pass `TASK_ID`
   when triggering the agent job;
5. the state of the project design (ready, or skipped) and the roadmap
   features; for a new repository, the foundations spec as the first task
   to implement (`docs/design/foundations.md`), then the first feature to
   design with `/design-studio <feature>`;
6. the issues: created (with their numbers) or still to create with
   `scripts/create-issues.py`, for the remote and custom scenarios;
7. the state of the skills (installed and checked, or still to install with
   `./scripts/install-skills.sh` and `./scripts/check-skills.sh`);
8. the next command to run, for example `claude` and "list the available
   agents".

Finally ask whether to delete this `SETUP.md`. It is not needed once the
project is configured, and every agent session that reads the repository
would otherwise see it.
