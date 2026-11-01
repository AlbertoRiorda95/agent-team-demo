---
feature: foundations
ready: yes
updated: 2026-11-01
owner: designer
milestone: M0
features: foundations
---

# Foundations

## Goal
A skeleton that builds, starts and passes CI, with no product feature: the
monorepo structure, the orders service serving the contract with placeholder
responses, the database reachable with its migration tool, the web app with
one placeholder page and its API types generated from the contract, one smoke
test per package, the UI tests of the placeholder page, and the local
environment. Every later task adds a feature to it instead of building
scaffolding, so roles working in parallel do not collide on shared files.

## Out of scope
- Any business logic: orders, statuses, authentication, the `money` functions
  (they are the specs of `money-library`, `order-intake`, `staff-auth`,
  `orders-list`, `order-detail`).
- A deployment target (none yet).
- Releasing `money` (the `money-library` feature ends with the `v0.1.0` tag).

## User flows
1. A developer clones the repository, runs `npm ci`,
   `npm ci --prefix packages/money`, `docker compose up -d`, `npm run db:migrate
   -w services/orders`, then `npm run dev -w services/orders` and
   `npm run dev -w apps/web`, and opens http://localhost:5173: the placeholder
   page shows the API health.
2. A pull request runs the CI: build-test per package, static analysis, SBOM
   and licenses, vulnerabilities (images included), UI tests: all green.

## Screens and states
| Screen / component | States | Notes |
|---|---|---|
| Placeholder home (`/`) | loading (spinner), error (API unreachable, Retry), success ("Orders — API ok") | only screen; replaced by the app shell in `staff-auth` |

All other screens: not applicable.
Responsive behavior: readable at 320, 768, 1280 (the Playwright viewports).
Accessibility: the UI test template checks axe, focus, touch targets, no
horizontal scroll.
Tokens: `apps/web/src/styles/tokens.css` with every token of the
design-system skill; the page uses only tokens.

## Data and API
Entities and fields: none yet. The database has the Drizzle setup and a first
empty migration, so the migration pipeline is proven.
Contract changes: none. The service serves every operation of
`services/orders/openapi.yaml`:
- `GET /health`: real, checks the database (200 `ok` / 503 `unavailable`).
- every `/api/v1` operation: registered with the contract's request schema,
  answering `501` `application/problem+json` ("Not implemented yet") until
  its feature lands.
Breaking for existing clients: no

## Structure and tooling
```
package.json            npm workspaces: services/orders, apps/web; root scripts
                        build/lint/typecheck/test run the workspaces and
                        --prefix packages/money; engines node 24
package-lock.json
tsconfig.base.json      strict, shared by every package
eslint.config.js        flat config (typescript-eslint, react rules for apps/web)
.prettierrc
.nvmrc                  24
compose.yml             postgres (+ orders for a full local run)
.env.example            DATABASE_URL, PORT, ORDER_SOURCE_API_KEY, SESSION_SECRET (placeholders)
packages/money/         standalone npm project, own package-lock.json
  package.json          @albertoriorda95/money 0.0.0, ESM, types, files: dist,
                        publishConfig.registry https://npm.pkg.github.com/
  src/index.ts          exports VERSION only
  test/smoke.test.ts
services/orders/
  openapi.yaml          (exists)
  src/main.ts           composition root; config from the environment
  src/adapters/http/    Fastify app, routes from the contract, problem+json errors
  src/adapters/persistence/  Drizzle client and schema (empty)
  migrations/           drizzle-kit output, first empty migration
  drizzle.config.ts
  test/                 smoke + contract test
  Dockerfile
apps/web/
  index.html, vite.config.ts (proxy /api and /health to :3000)
  src/main.tsx, src/App.tsx, src/styles/tokens.css
  src/api/schema.d.ts   generated (npm run gen:api), committed
  src/api/client.ts     fetch wrapper typed from schema.d.ts
  playwright.config.ts, e2e/ui.spec.ts  (exist; filled in for the placeholder page)
  Dockerfile
```
Scripts (names fixed by `AGENTS.md` > Commands): root `build`, `lint`,
`typecheck`, `test`; per package `build`, `lint`, `typecheck`, `test`, `dev`;
`services/orders`: `db:generate`, `db:migrate`; `apps/web`: `gen:api`,
`preview`. Vitest in every package; `apps/web` excludes `e2e/` from Vitest.
Dev dependencies of `apps/web`: `@playwright/test`, `@axe-core/playwright`,
`openapi-typescript`.

Local environment: `docker compose up -d` starts Postgres 17 on 5432
(user/password/db `orders`, dev only); the service on 3000, the web app on
5173. CI: a Postgres 17 service container for the orders job, a separate test
database (`orders_test`).

## Acceptance criteria
- [ ] `npm ci && npm ci --prefix packages/money && npm run build && npm run lint && npm run typecheck && npm test` passes from a clean clone.
- [ ] `npm test -w services/orders` includes a contract test that fails if a
      method+path of `openapi.yaml` is not registered or a registered route is
      not in the file.
- [ ] `GET /health` returns 200 `{"status":"ok"}` with the database up and 503
      `{"status":"unavailable"}` with it down (both tested).
- [ ] Any `/api/v1` operation returns 501 `application/problem+json`; an
      invalid body (e.g. `POST /api/v1/auth/login` with `{}`) returns 422 from
      the contract's schema.
- [ ] `npm run db:migrate -w services/orders` applies the first migration on
      an empty database and is idempotent.
- [ ] `npm run gen:api -w apps/web` regenerates `apps/web/src/api/schema.d.ts`
      with no diff from the committed file.
- [ ] The placeholder page shows "API ok" with the service up, and the error
      state with Retry when `/health` fails (UI test with the API mocked) at
      320, 768 and 1280, no axe violations.
- [ ] `docker compose up -d` starts Postgres; the orders image and the web
      image build in CI and pass the image scan.
- [ ] CI is green on the pull request: `ci-ok`, static analysis, SBOM and
      licenses, vulnerabilities, UI.

## Test seams
- `packages/money`: its public entry (`src/index.ts`), Vitest; catches a broken
  build or export, misses everything else (no logic yet).
- API: the Fastify app built in-process (`app.inject`), `/health` against the
  test database and with the database stopped (an unreachable `DATABASE_URL`);
  catches routing, contract drift, configuration; misses real HTTP and the proxy.
- Contract: `openapi.yaml` versus the registered routes; catches drift both ways.
- UI: the placeholder page at the three viewports, `/health` mocked with
  `page.route()`; catches layout, accessibility, states; misses the real API.

## Reuse
- HTTP: Fastify (decided in setup) with its JSON-schema validation fed from
  `openapi.yaml`.
- Database: Drizzle ORM + drizzle-kit, `pg` driver (decided in setup).
- Web: React + Vite (decided in setup); no UI library (project design).
- API types: openapi-typescript (decided in setup).
- Tests: Vitest, Playwright + @axe-core/playwright (template).
- `money`: not used yet; the skeleton must not depend on it before `v0.1.0`.

## Decisions
- 2026-11-01 — Routes not yet implemented answer 501 problem+json but validate
  their input from the contract — the contract test proves the API surface
  from day one.
- 2026-11-01 — `src/api/schema.d.ts` is committed and checked in CI for drift
  — the web build does not need the service to run.
- 2026-11-01 — Postgres 17 in Compose and as the CI service, `orders_test` for
  the tests.
- 2026-11-01 — The web image is an unprivileged nginx serving the build and
  proxying `/api` to orders — one origin in containers too.
- 2026-11-01 — Task 2 (backend) owns the root files (package.json, lockfile,
  lint config); web depends on it — no two roles on the same files.

## Open questions
- (none)

## Task breakdown
| # | Role | Task | Depends on | Issue |
|---|---|---|---|---|
| 1 | backend | [money] Scaffold `packages/money` as a standalone npm project: package.json (`@albertoriorda95/money` 0.0.0, ESM + types, publishConfig to GitHub Packages), its lockfile, tsconfig, Vitest, ESLint, build to `dist/`, smoke test | — | - |
| 2 | backend | [orders] Root workspace (package.json, lockfile, tsconfig.base, ESLint, Prettier, .nvmrc, .env.example) and the orders skeleton: Fastify app, config from the environment, `/health` with the database check, every contract operation answering 501, contract test, Drizzle + drizzle-kit with the first empty migration, smoke tests | — | - |
| 3 | frontend | [web] Scaffold `apps/web`: Vite + React + TypeScript workspace, tokens.css from the design system, placeholder page with its states, `gen:api` and the generated types, typed client, Vite proxy, Vitest smoke test (e2e excluded), Playwright UI tests of the placeholder page | 2 | - |
| 4 | devops | [orders] compose.yml (Postgres 17, the service), the orders Dockerfile (non-root, pinned base image, healthcheck), Postgres service container and test database in the CI orders job, schema drift check of `schema.d.ts` | 2 | - |
| 5 | devops | [web] The web Dockerfile (static build served by an unprivileged nginx, `/api` proxied to orders), image built and scanned in CI | 3, 4 | - |

## Readiness checklist
- [x] goal, users and out of scope agreed
- [x] every flow has its error and edge cases
- [x] every screen has empty, loading, error and success states
- [x] contract changes written, breaking changes approved by the user
- [x] acceptance criteria are observable
- [x] test seams agreed
- [x] reuse decided: team libraries and new dependencies named, or "none"
- [x] task breakdown with roles and dependencies
- [x] no open questions
