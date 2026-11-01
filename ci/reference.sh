#!/usr/bin/env bash
# ci/reference.sh: builds the reference documentation from the code, with the
# stack's own generators, the same on GitHub and GitLab and on your computer.
#   ci/reference.sh        every generator that applies to this project
# It writes to $REFERENCE_DIR (reports/reference/), which the CI saves as the
# artifact "reference-docs". Nothing is committed: the writer agent's documents
# link to it. A generator that does not apply is skipped; one that applies and
# fails fails the job.
# Orders: the OpenAPI contract of services/orders, and typedoc for each
# TypeScript package that has a src/ folder.
set -euo pipefail
cd "$(dirname "$0")/.."
source ci/scanners.env
OUT=${REFERENCE_DIR:-reports/reference}
mkdir -p "$OUT"
built=0

# API contract (OpenAPI) -> one HTML page. build-docs renders even an invalid
# contract: lint it first, with the project's redocly.yaml if there is one,
# else only the structural rules (minimal)
CONTRACT=services/orders/openapi.yaml
if [ -f "$CONTRACT" ]; then
  if [ -f redocly.yaml ]; then lint=(); else lint=(--extends=minimal); fi
  npx --yes "@redocly/cli@$REDOCLY_VERSION" lint "${lint[@]}" "$CONTRACT"
  npx --yes "@redocly/cli@$REDOCLY_VERSION" build-docs "$CONTRACT" -o "$OUT/api/index.html"
  built=1
fi

# TypeScript -> typedoc, one folder per package (needs its tsconfig.json and src/;
# entry points from the package's typedoc.json if it has one)
for pkg in packages/money services/orders apps/web; do
  [ -f "$pkg/tsconfig.json" ] && [ -d "$pkg/src" ] || continue
  name=$(basename "$pkg")
  dest="$PWD/$OUT/typescript/$name"
  if [ -f "$pkg/typedoc.json" ]; then
    (cd "$pkg" && npx --yes "typedoc@$TYPEDOC_VERSION" --options typedoc.json --out "$dest")
  else
    (cd "$pkg" && npx --yes "typedoc@$TYPEDOC_VERSION" --entryPointStrategy expand --out "$dest" src)
  fi
  built=1
done

# Other stacks: add the generator here, writing under "$OUT/<name>":
#   Go      go install golang.org/x/pkgsite/cmd/pkgsite@latest (served) or go doc -all ./...
#   Java    ./mvnw javadoc:javadoc  or  ./gradlew javadoc
#   Rust    cargo doc --no-deps
#   .NET    docfx
#   GraphQL npx graphql-markdown, protobuf: protoc-gen-doc

if [ "$built" = 0 ]; then
  echo "reference: no generator applies to this project (see ci/reference.sh)."
fi
