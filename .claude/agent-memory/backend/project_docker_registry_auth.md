---
name: docker-registry-auth
description: Image builds (vulnerabilities job) can't fetch @albertoriorda95/money from GitHub Packages; no token reaches docker build. Devops fix, not backend
metadata:
  type: project
---

On 2026-11-05 (PR #42), the `vulnerabilities` CI job failed in "Build and scan the images":
`npm ci` inside `services/orders/Dockerfile` got a 401 from npm.pkg.github.com for `@albertoriorda95/money`.
`ci/registry.sh login` writes the token to the runner's ~/.npmrc, but `docker build` never sees it.

**Why:** it is the first private registry dependency of the service, and nothing in the Dockerfile or ci.yml passes the credentials through.

**How to apply:** this is not a CVE and not backend code. The fix is a BuildKit secret: `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci ...` in the Dockerfile, plus `docker build --secret id=npmrc,src=$HOME/.npmrc` and `./ci/registry.sh login` in the vulnerabilities job. It belongs to devops (Dockerfile*, workflows), and the CI agent can't push workflows. Check whether it has landed before adding a registry dependency to apps/web. See [[ci-sandbox-limits]].
