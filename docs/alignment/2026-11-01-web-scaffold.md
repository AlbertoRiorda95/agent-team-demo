---
status: open
date: 2026-11-01
author: frontend
task: "#3"
mr: feat/web-scaffold (PR linked in issue #3)
breaking: no
affects: [devops]
decision-needed: no
---

## What changed
`apps/web` now exists as a workspace (Vite + React): design tokens in
`apps/web/src/styles/tokens.css`, a placeholder page, a typed client and the
generated `schema.d.ts`. The root `package-lock.json` changed only because the
workspace gained its dependencies.

## What the others relied on (before → after)
- Web build: nothing → `npm run build -w apps/web` writes the static site to `apps/web/dist/`.
- Ports: dev server 5173 (`npm run dev -w apps/web`), Playwright serves the build on 4173 (`vite preview`).
- The app calls `/health` and `/api/v1/*` on its own origin; the Vite proxy forwards them to `http://localhost:3000` in dev and preview. The production nginx (task 5) must proxy `/api` and `/health` to orders.
- UI tests: `npx playwright test` from `apps/web` (needs `npx playwright install chromium`), output in `apps/web/reports/ui/`.

## Follow-up actions
<!-- written by designer, one checkbox per affected role -->
- [ ] devops: web Dockerfile serves `apps/web/dist/` and proxies `/api` and `/health`; CI `ui` job installs Playwright browsers.

## Resolution
