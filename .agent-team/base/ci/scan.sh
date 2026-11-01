#!/usr/bin/env bash
# ci/scan.sh: the security steps of the CI, the same on GitHub and GitLab.
#   ci/scan.sh sbom-licenses     SBOM (syft) + license report and policy (trivy)
#   ci/scan.sh vulnerabilities   vulnerabilities from the SBOM (grype)
#                                + secrets and misconfigurations (trivy)
#                                + the container image, if IMAGE is set (trivy)
#   ci/scan.sh static            static analysis for bugs and unsafe code (semgrep);
#                                with BASELINE_REF set (a PR/MR) only the findings
#                                the change introduces count
# Every report goes to $REPORTS_DIR, which the CI saves as an artifact.
# Run sbom-licenses after installing the dependencies: license data come from them.
set -euo pipefail
source "$(dirname "$0")/scanners.env"
export PATH="${SCANNERS_BIN:-$HOME/.local/bin}:$PATH"
R=$REPORTS_DIR
mkdir -p "$R"

case "${1:-}" in
  sbom-licenses)
    syft dir:. --exclude "./$R" \
      -o "cyclonedx-json=$R/sbom.cdx.json" -o "spdx-json=$R/sbom.spdx.json"

    # one line per component: name, version, licenses
    jq -r '["name","version","licenses"],
      (.components[]? | [.name, (.version // ""),
        ([.licenses[]? | (.license.id // .license.name // .expression)]
          | map(select(. != null)) | join(" | "))])
      | @csv' "$R/sbom.cdx.json" > "$R/licenses.csv"

    trivy fs --scanners license --format json  --output "$R/licenses-trivy.json" .
    trivy fs --scanners license --format table --output "$R/licenses.txt" .
    # policy: fail on the license categories in LICENSE_FAIL_SEVERITY
    trivy fs --scanners license --severity "$LICENSE_FAIL_SEVERITY" --exit-code 1 --format table .
    ;;

  vulnerabilities)
    [ -f "$R/sbom.cdx.json" ] || { echo "Missing $R/sbom.cdx.json: run sbom-licenses first." >&2; exit 2; }
    status=0

    grype "sbom:$R/sbom.cdx.json" -o json  --file "$R/grype.json"
    grype "sbom:$R/sbom.cdx.json" -o sarif --file "$R/grype.sarif"
    grype "sbom:$R/sbom.cdx.json" -o table --fail-on "$VULN_FAIL_ON" | tee "$R/grype.txt" || status=1

    trivy fs --scanners secret,misconfig --skip-dirs "$TRIVY_SKIP_DIRS" \
      --format json --output "$R/trivy-fs.json" .
    trivy fs --scanners secret,misconfig --skip-dirs "$TRIVY_SKIP_DIRS" \
      --severity "$TRIVY_FAIL_SEVERITY" --exit-code 1 . || status=1

    if [ -n "${IMAGE:-}" ]; then
      trivy image --format json --output "$R/trivy-image.json" "$IMAGE"
      trivy image --severity "$TRIVY_FAIL_SEVERITY" --exit-code 1 "$IMAGE" || status=1
    fi
    exit $status
    ;;

  static)
    args=(--metrics=off --json-output="$R/semgrep.json" --sarif-output="$R/semgrep.sarif"
          --text-output="$R/semgrep.txt")
    for c in $SEMGREP_CONFIG; do args+=(--config "$c"); done
    IFS=, read -ra skip <<< "$SEMGREP_EXCLUDE"
    for d in "${skip[@]}"; do args+=(--exclude "$d"); done
    if [ -n "${BASELINE_REF:-}" ]; then
      base=$(git merge-base "$BASELINE_REF" HEAD)
      args+=(--baseline-commit "$base")
      scope="introduced by this change"
    else
      scope="in the whole repository"
    fi
    semgrep scan "${args[@]}" .
    n=$(jq --arg s "$STATIC_FAIL_SEVERITY" \
      '[.results[] | select(.extra.severity as $x | ($s | split(",") | index($x)))] | length' "$R/semgrep.json")
    echo "semgrep: $n finding(s) of severity $STATIC_FAIL_SEVERITY $scope (details in $R/semgrep.txt)."
    if [ "$n" -gt 0 ] && { [ -n "${BASELINE_REF:-}" ] || [ "$STATIC_FAIL_FULL" = yes ]; }; then
      exit 1
    fi
    ;;

  *)
    echo "usage: $0 sbom-licenses | vulnerabilities | static" >&2
    exit 2
    ;;
esac
