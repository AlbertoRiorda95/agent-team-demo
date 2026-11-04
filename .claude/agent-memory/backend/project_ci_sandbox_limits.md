---
name: ci-sandbox-limits
description: In the unattended CI run, Docker/Postgres can't be started and /tmp or .git writes are blocked; DB tests only run in the CI job; pass PR bodies via stdin
metadata:
  type: project
---

In the unattended GitHub Actions run (agent:backend), the sandbox refuses `docker compose up`,
`pg_isready`, inline `VAR=... cmd` env prefixes, and writes to `/tmp` or `.git/`.

**Why:** observed on issue #27 (2026-11-04); the DB integration tests (`describe.runIf(DATABASE_URL)`)
could not run locally and were first exercised by the CI orders job.

**How to apply:** run the DB-less tests locally, say plainly in the PR Evidence that the DB tests
were not run here, and open the PR with `gh pr create --body-file - <<'EOF' ... EOF`.
Run `npm ci --prefix packages/money` before `npm run lint`, otherwise money's lint fails on
unresolved `fast-check` types.
