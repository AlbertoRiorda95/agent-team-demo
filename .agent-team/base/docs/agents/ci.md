# CI

Every MR runs the project CI: build, type check, test, static analysis,
SBOM and license report, license policy, vulnerabilities, secrets and
misconfigurations (`ci/scan.sh`).
- A red CI is part of your task: fix the cause, never weaken the check. Do not
  edit `ci/scanners.env`, skip a test or add an ignore rule without the user's
  explicit approval in the MR.
- Static analysis: semgrep fails the MR on the findings your change
  introduces (details in `semgrep.txt`, artifact `static-analysis`). Fix the
  code. If you think a finding is a false positive, do not suppress it
  yourself: explain it in the MR under `## Static analysis` and let the user
  decide. A `nosemgrep: <rule-id>` comment, with the reason next to it, only
  with the user's approval.
- Workflow files: after editing anything in `.github/workflows/`, run
  `actionlint` (the `Workflow lint` check runs it on every PR). A job-level `if`
  can use only the `github`, `needs`, `vars`, `inputs` and `matrix` contexts:
  `hashFiles()` works in steps only, and one in a job `if` makes GitHub reject
  the whole file, so no job runs.
- UI tests: when `playwright.config.ts` exists, the `ui` job runs the tests
  in `e2e/` and keeps the report and the screenshots per viewport (artifact
  `ui-report`). A screen or state without its UI test is not done.
- When you run outside CI (a local session, the Multica daemon, the
  orchestrator), wait for the checks after opening the MR (`gh pr checks
  --watch`, or `glab ci status` until the pipeline ends), fix what fails and
  push again. Agents that run inside CI jobs do not wait: the user or the
  orchestrator sends the failures back.
- The `reference-docs` job builds the reference from the code with
  `ci/reference.sh`; if it fails, the code or the generator's configuration is
  at fault (a missing doc comment is not a failure). Never write the reference
  by hand.
- Before you push you can run the same checks with the `local-ci` skill; it
  does not replace waiting for the real CI when there is one.
