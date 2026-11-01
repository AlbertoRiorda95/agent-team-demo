#!/usr/bin/env bash
# ci/reference.sh: builds the reference documentation from the code, with the
# stack's own generators, the same on GitHub and GitLab and on your computer.
#   ci/reference.sh        every generator that applies to this project
# It writes to $REFERENCE_DIR (reports/reference/), which the CI saves as the
# artifact "reference-docs". Nothing is committed: the writer agent's documents
# link to it. A generator that does not apply is skipped; one that applies and
# fails fails the job.
# CUSTOMIZE: keep the generators of your stack, delete the others; the commands
# (and the dev dependency they need, such as typedoc) belong to the project.
set -euo pipefail
cd "$(dirname "$0")/.."
source ci/scanners.env
OUT=${REFERENCE_DIR:-reports/reference}
mkdir -p "$OUT"
built=0

# API contract (OpenAPI) -> one HTML page. build-docs renders even an invalid
# contract: lint it first, with the project's redocly.yaml if there is one,
# else only the structural rules (minimal)
if [ -f docs/api/openapi.yaml ]; then
  if [ -f redocly.yaml ]; then lint=(); else lint=(--extends=minimal); fi
  npx --yes "@redocly/cli@$REDOCLY_VERSION" lint "${lint[@]}" docs/api/openapi.yaml
  npx --yes "@redocly/cli@$REDOCLY_VERSION" build-docs docs/api/openapi.yaml -o "$OUT/api/index.html"
  built=1
fi

# TypeScript -> typedoc (needs a tsconfig.json; entry points from typedoc.json or src/)
if [ -f tsconfig.json ] && [ -d src ]; then
  if [ -f typedoc.json ]; then
    npx --yes "typedoc@$TYPEDOC_VERSION" --options typedoc.json --out "$OUT/typescript"
  else
    npx --yes "typedoc@$TYPEDOC_VERSION" --entryPointStrategy expand --out "$OUT/typescript" src
  fi
  built=1
fi

# Python -> pdoc (the package named in PYTHON_PACKAGE, or the first one under src/)
if [ -f pyproject.toml ] || [ -f setup.py ]; then
  pkg=${PYTHON_PACKAGE:-$(find src -maxdepth 2 -name __init__.py 2>/dev/null | head -1 | xargs -r dirname | xargs -r basename)}
  if [ -n "$pkg" ]; then
    # pdoc imports the package: install the project's dependencies first (CUSTOMIZE)
    python3 -m venv "$OUT/.pdoc-venv"
    "$OUT/.pdoc-venv/bin/pip" install --quiet "pdoc==$PDOC_VERSION"
    PYTHONPATH=src "$OUT/.pdoc-venv/bin/python" -m pdoc -o "$OUT/python" "$pkg"
    rm -rf "$OUT/.pdoc-venv"
    built=1
  fi
fi

# Other stacks: add the generator here, writing under "$OUT/<name>":
#   Go      go install golang.org/x/pkgsite/cmd/pkgsite@latest (served) or go doc -all ./...
#   Java    ./mvnw javadoc:javadoc  or  ./gradlew javadoc
#   Rust    cargo doc --no-deps
#   .NET    docfx
#   GraphQL npx graphql-markdown, protobuf: protoc-gen-doc

if [ "$built" = 0 ]; then
  echo "reference: no generator applies to this project (see ci/reference.sh)."
fi
