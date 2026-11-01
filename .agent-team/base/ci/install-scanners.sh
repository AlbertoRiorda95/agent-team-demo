#!/usr/bin/env bash
# ci/install-scanners.sh: installs the CI tools at the versions in ci/scanners.env.
#   ci/install-scanners.sh            syft, grype and trivy, from the official
#                                     GitHub releases, verifying the checksums
#   ci/install-scanners.sh semgrep    only the tools given (semgrep: from PyPI,
#                                     in its own virtual environment, needs python3;
#                                     actionlint: GitHub release, checksum verified)
# Linux amd64. CUSTOMIZE: the asset names for arm64 runners.
set -euo pipefail
source "$(dirname "$0")/scanners.env"

BIN=${SCANNERS_BIN:-$HOME/.local/bin}
mkdir -p "$BIN"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

fetch() {  # name base-url asset checksums-file
  local name=$1 base=$2 asset=$3 sums=$4
  curl -sSfL -o "$TMP/$asset" "$base/$asset"
  curl -sSfL -o "$TMP/$sums" "$base/$sums"
  (cd "$TMP" && grep " ${asset}\$" "$sums" | sha256sum -c -)
  tar -xzf "$TMP/$asset" -C "$TMP" "$name"
  install -m 0755 "$TMP/$name" "$BIN/$name"
}

TOOLS=${*:-syft grype trivy}
for tool in $TOOLS; do
  case $tool in
    syft)  fetch syft  "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}" \
             "syft_${SYFT_VERSION}_linux_amd64.tar.gz" "syft_${SYFT_VERSION}_checksums.txt" ;;
    grype) fetch grype "https://github.com/anchore/grype/releases/download/v${GRYPE_VERSION}" \
             "grype_${GRYPE_VERSION}_linux_amd64.tar.gz" "grype_${GRYPE_VERSION}_checksums.txt" ;;
    trivy) fetch trivy "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}" \
             "trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" "trivy_${TRIVY_VERSION}_checksums.txt" ;;
    actionlint) fetch actionlint "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}" \
             "actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz" "actionlint_${ACTIONLINT_VERSION}_checksums.txt" ;;
    semgrep)
      python3 -m venv "$HOME/.local/semgrep-venv"
      "$HOME/.local/semgrep-venv/bin/pip" install --quiet "semgrep==${SEMGREP_VERSION}"
      ln -sf "$HOME/.local/semgrep-venv/bin/semgrep" "$BIN/semgrep" ;;
    *) echo "unknown tool: $tool" >&2; exit 2 ;;
  esac
done

# GitHub Actions: make the tools available to the next steps
if [ -n "${GITHUB_PATH:-}" ]; then echo "$BIN" >> "$GITHUB_PATH"; fi
for tool in $TOOLS; do echo "$tool: $("$BIN/$tool" --version | head -1)"; done
