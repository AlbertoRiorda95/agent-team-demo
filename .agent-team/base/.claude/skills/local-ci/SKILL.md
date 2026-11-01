---
name: local-ci
description: Run on this computer the same checks the project's CI runs (build, type check, tests, UI tests, static analysis, licenses, vulnerabilities, secrets) and fix what fails. Use it before pushing, for convenience, or instead of the CI when the project has no real one (no remote, or "ci": "none").
argument-hint: "[check: build | test | ui | static | licenses | vulnerabilities]"
disable-model-invocation: true
---

Run the project's CI checks locally and fix the failures. Only the checks
named in $ARGUMENTS, if given; otherwise all of them.

This is a convenience before a push, or the substitute for the CI when the
project has none. It is not the real CI: a green run here proves nothing to
anyone else, and the platform's CI stays the one that gates the merge.

1. **Find the checks.** Do not assume: read what the CI runs.
   `.github/workflows/ci.yml` or `.gitlab/ci/ci.yml` for the jobs and their
   commands, `AGENTS.md > Commands` for the project's own, `ci/scan.sh` and
   `ci/scanners.env` for the security steps. With no CI file, use `AGENTS.md > Commands`
   plus `ci/scan.sh`. Tell the user the list you will run, in one line.
2. **Run them in the CI's order,** from the repository root:
   - build, lint, type check, tests: the commands you found;
   - UI tests, only when `playwright.config.ts` exists: `npx playwright test`;
   - `./ci/install-scanners.sh` once (it installs the tools in `~/.local/bin`
     and needs the network; if it cannot, say which checks you skipped);
   - `BASELINE_REF=origin/<default branch> ./ci/scan.sh static` on a branch
     (only the findings the change introduces count, as in a merge request;
     without a remote, `BASELINE_REF=<default branch>`), plain
     `./ci/scan.sh static` on the default branch;
   - `./ci/scan.sh sbom-licenses`, after installing the dependencies;
   - `./ci/scan.sh vulnerabilities` (also scans the image if you set `IMAGE`);
   - `./ci/reference.sh`, when the CI has a `reference-docs` job (it only
     builds the reference documentation: a failure means the code or the
     generator configuration).
   Run every check even if one fails, so the user gets the whole picture.
3. **Fix what fails,** the cause and not the check:
   - build, type, lint, test failures: fix the code (or a test that is wrong,
     saying why); never skip, delete or weaken a test;
   - static analysis: fix the code. A finding you think is a false positive
     is reported, not suppressed: no `nosemgrep` comment without the user's yes;
   - vulnerabilities: upgrade the dependency to a fixed version, or replace
     it; if no fix exists, report it;
   - secrets: remove the secret from the code and tell the user it must be
     rotated, because it is in the history; never commit a secret to "fix" it;
   - licenses: report the dependency and the license; choosing between
     replacing it and accepting it is the user's;
   - never edit `ci/scanners.env`, the CI files or ignore lists to make a
     check pass.
4. **Run again** the checks that failed, and the ones your fixes could break.
   At most three rounds; then stop and report what is left.
5. **Report** a table: check, result, what you changed; then what needs the
   user (false positives, licenses, rotations, checks skipped and why). The
   fixes stay in the working tree: do not commit or push unless asked.

Reports are in `reports/` (git-ignored). Without a remote nothing else
checks the work: say so once at the end if the project has no CI.
