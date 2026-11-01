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

<!-- CUSTOMIZE: setup fills this in. One section per library; delete the example.
     Consume a library from a registry when you can; a Git dependency at a tag
     when there is no registry; a submodule only to build it from source. -->

## example-lib
- **What it does**: <one line: what to use it for>
- **Repository**: <https://github.com/org/example-lib>
- **How to get it**: <registry and package name, for example `@org/example-lib`
  from GitHub Packages (`.npmrc`: `@org:registry=https://npm.pkg.github.com`);
  or `git+https://github.com/org/example-lib@v1.4.0`>
- **Version**: <the range this project accepts, for example `^1.4`>
- **Credentials**: <how the CI reads it: the job token (same platform), or
  the `REGISTRY_TOKEN` secret; locally, your own token in `REGISTRY_TOKEN`
  and `./ci/registry.sh login`. Never in a committed file>
- **Documentation**: <its README, docs/ or generated reference: where to read
  the API before using it>
- **Owner**: <who maintains it, where to open an issue>
