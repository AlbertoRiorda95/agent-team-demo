# @albertoriorda95/money

Amounts, currencies, rounding and formatting for the Orders project.

Status: scaffold (`0.0.0`). The public entry exports `VERSION` only; the money
functions arrive with the `money-library` feature
(`docs/design/money-library.md`) and the `v0.1.0` release.

## Use
Install it from GitHub Packages (the repository's `.npmrc` maps the
`@albertoriorda95` scope; run `./ci/registry.sh login` first). Never import it
through a relative path or a workspace link.

```ts
import { VERSION } from "@albertoriorda95/money";
```

## Develop
This is a standalone npm project with its own lockfile, not a root workspace.
From the repository root:

```sh
npm ci --prefix packages/money
npm --prefix packages/money run lint
npm --prefix packages/money run typecheck
npm --prefix packages/money run build   # ESM + .d.ts in dist/
npm test --prefix packages/money
```

Releases are published by `.github/workflows/publish.yml` when a `v*` tag is
pushed.
