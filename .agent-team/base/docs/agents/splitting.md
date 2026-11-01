# Splitting issues

In CI the user can ask for a proposal that splits one issue into task issues,
one per role: the `agent:split` label on GitHub, `SPLIT_ISSUE` on GitLab. The
proposal is a plan in the format at the top of `scripts/agentteam/plans.py`; the
user approves it (`@claude ok`) and the script creates exactly that. Rules for
the plan:
- One task per role and per boundary (see "How work is delegated"): a task
  never makes two roles edit the same files.
- Follow the standard feature sequence: the API contract first when the
  feature changes it, then backend and frontend against it; devops only if
  the pipeline, the image or the manifests change.
- No ready spec for the work: propose a single designer task that writes it,
  or say in a comment that a design studio session with the user is needed.
  Never plan implementation tasks on missing design.
- A breaking contract change is planned as expand-contract (see "API
  contract"): the expand task, the tasks that move the callers (depending on
  it), a last contract task (depending on all of them).
- In a monorepo (services listed in `AGENTS.md`), one task per role and per
  service, its text starting with the service: `[orders] Add the endpoint`.
- optimizer, security and writer only when the issue asks for them explicitly.
- At most 6 tasks. If more are needed, say so and propose splitting the issue
  into features first.
- Every task has acceptance criteria someone can check without reading the
  code, and lists the files or folders it touches.
- Never add labels: the user starts each task.
