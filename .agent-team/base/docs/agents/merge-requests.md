# Branches and merge requests

- One branch per task, named `feat/<task-id>-<slug>` (in GitHub Actions, the
  branch the action creates for you).
- Before opening the MR, bring your branch up to date with `main` and run the
  tests again. Where you are not allowed to rebase (the Claude GitHub action),
  say in the MR that the branch must be updated before merging.
- Before opening the MR, check whether `main` changed the API contract or
  `docs/alignment/` since you started; if it did, adapt or report it.

## Merge request description
When the task has a GitHub or GitLab issue, the description ends with
`Closes #<issue>`: merging the MR then closes the issue, which is what frees
the tasks that depend on it. On other trackers the user closes it.

Every MR description has these sections, short:
- **Summary**: what changed and why; for a structural change, the smallest
  sketch that makes it clear (a call tree, a file tree, a diff of a component
  tree).
- **Evidence**: before and after. Screenshots for UI changes (the `ui-report`
  artifact, or `reports/ui/` locally), otherwise the test that failed before
  and passes now, or the command output.
- **Merge danger**: one-way or two-way door (can the merge simply be
  reverted, or does it migrate data, delete something, break a client?) and
  the blast radius in a few words (which users, screens or clients feel it).
- **Not done**: what you decided not to do, and why.
- **Reviewer checks**: what the reviewer must look at.
- **Alignment impact**: the `docs/alignment/` entry, or "none".
- **Dependencies**: added, removed or upgraded, with the reason and the
  checklist result (`docs/agents/dependencies.md`), or "none".
