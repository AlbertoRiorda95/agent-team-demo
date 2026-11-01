# Dependencies and reuse

Read this before you add a dependency, or before you write something generic
(parsing, retries, dates, auth, validation, a client for a known API).

## Order of preference
1. **What the project already has**: a dependency already installed, a module
   of this repository, a shared component. Search before writing.
2. **The team's own libraries**, in `docs/general/libraries.md`: use them as
   that file says (registry, version, documentation).
3. **A trusted third-party library**, if it passes the checklist below.
4. **Your own code**, when nothing fits or the need is a few lines: a
   dependency for ten lines of code is a liability, not reuse.

The spec's `## Reuse` section may already have decided: follow it. A new
runtime dependency the spec does not mention needs the user's yes: propose it
in the MR, or stop and ask in a local session.

## Checklist for a third-party library
- **It exists, under that exact name.** Look it up in the registry (npm,
  PyPI, Maven Central, crates.io...) and follow the link to its source
  repository. Never install a name from memory: plausible names that do not
  exist, or that someone registered to catch this mistake, are a known attack
  on AI agents. Check the spelling, the publisher and the download count.
- **License** allowed by the policy (`ci/scanners.env`; the CI checks it).
- **Maintained**: a release in the last year, more than one maintainer or an
  organization behind it, issues answered.
- **No known high or critical vulnerability** in the version you pick (the
  CI checks it; check before, not after). OpenSSF Scorecard and deps.dev are
  good signals when you can reach them.
- **Weight**: few transitive dependencies, a size that fits what it does.
- **Pinned** through the lockfile, at a released version, never a branch.

Without network access (some CI runners), use what the registry metadata and
the lockfile tell you, and say in the MR what you could not check.

## In the MR
Under **Dependencies**: each dependency added, removed or upgraded, what it
is for, the alternatives considered (including writing it), and the
checklist result in one line. "none" when nothing changed.

## The team's libraries
They come from the registry in `ci/registry.env`. If installing fails with
an authentication error, do not look for a token and do not write one
anywhere: say that `./ci/registry.sh login` is needed (locally, with the
user's own `REGISTRY_TOKEN`) and stop. Never publish a package or push a tag:
the release job does it when the user pushes a `v*` tag, or the user runs
`./ci/registry.sh local` or `publish` on their computer.

Never change one of them from this repository (no copy, no patch in
`node_modules` or a vendored folder). If it lacks something, stop: propose an
issue for the library's repository in your final message, and the task that
needs it waits for its release.
