# The team's libraries

The libraries the team maintains and that this project reuses. Agents read
this before writing something one of them already does
(`docs/agents/dependencies.md`), and design-studio before planning it.

The connection to the registry is `ci/registry.sh` (settings in
`ci/registry.env`): run `./ci/registry.sh login` once, with your token in
`REGISTRY_TOKEN`, before installing the dependencies. Without a registry, a
library released with `./ci/registry.sh local` on this machine is found in the
package manager's local repository (`~/.m2`, Conan's cache, or the folder in
`LOCAL_REPOSITORY` for npm and Python).

## @albertoriorda95/money
- **What it does**: amounts, currencies, rounding and formatting. Use it for
  every amount in the service and the web app: never floats or hand-written
  currency formatting.
- **Repository**: this one, `packages/money/`
  (https://github.com/AlbertoRiorda95/agent-team-demo). It is released on its
  own with a `v*` tag (`.github/workflows/publish.yml`).
- **How to get it**: `@albertoriorda95/money` from GitHub Packages (the
  committed `.npmrc` maps the scope to `https://npm.pkg.github.com/`). Never
  through a relative import or a workspace link.
- **Version**: the range in each `package.json` (`^0.x` at first); a change to
  money reaches orders and web only through a new release and a bump.
- **Credentials**: in CI the job token (`GITHUB_TOKEN`, `packages: read`);
  locally, your own token with `read:packages` in `REGISTRY_TOKEN` and
  `./ci/registry.sh login`. Never in a committed file.
- **Documentation**: `packages/money/README.md` and the typedoc reference
  (CI artifact `reference-docs`).
- **Owner**: AlbertoRiorda95; issues in this repository.
