#!/usr/bin/env bash
# ci/registry.sh: this project's packages, the same in CI and on your computer.
#   ci/registry.sh login     read access to the team's registry, before installing the dependencies
#   ci/registry.sh publish   upload this project's package to the registry (the release job)
#   ci/registry.sh local     install it in this machine's local repository instead
#                            (mvn install, conan create...): the release without a remote
# Settings in ci/registry.env. The token is never in the repository: it comes
# from the environment, and this script writes it into the package manager's
# user-level configuration (~/.npmrc, pip's user config, ~/.m2/settings.xml,
# ~/.gradle/gradle.properties, Conan's home), which on a CI runner lives only
# as long as the job.
#   read     REGISTRY_TOKEN (a read-only token), or the platform's job token when
#            the registry is the platform's own: GITHUB_TOKEN (GitHub Packages,
#            with "packages: read") or CI_JOB_TOKEN (GitLab package registry)
#   publish  REGISTRY_PUBLISH_TOKEN, given only to the release job, or the job
#            token (GitHub "packages: write"; GitLab CI_JOB_TOKEN)
#   local    no token
# On your computer, export REGISTRY_TOKEN with your own token before running it.
set -euo pipefail
cd "$(dirname "$0")/.."
source ci/registry.env
action=${1:-}
case "$action" in login|publish|local) ;; *) echo "usage: $0 login | publish | local" >&2; exit 2 ;; esac
kind=${REGISTRY_KIND:-none}
[ "$kind" = none ] && { echo "registry: REGISTRY_KIND=none (ci/registry.env): nothing to do"; exit 0; }
if [ "$action" != login ] && [ "${PUBLISH_PACKAGE:-no}" != yes ]; then
  echo "registry: PUBLISH_PACKAGE is not yes: this project is not a package"; exit 0
fi
if [ "$action" = login ] && [ -z "${REGISTRY_URL:-}" ]; then
  echo "registry: no REGISTRY_URL: dependencies come from the public registries"; exit 0
fi
if [ "$action" = publish ] && [ -z "${REGISTRY_URL:-}" ]; then
  echo "registry: no REGISTRY_URL to publish to: ./ci/registry.sh local installs the package on this machine" >&2
  exit 1
fi
LOCAL_DIR=${LOCAL_REPOSITORY:-$HOME/.local/share/packages}   # npm and pypi: there is no local registry
ID=${REGISTRY_ID:-team}
mvn_() { if [ -x ./mvnw ]; then ./mvnw -B "$@"; else mvn -B "$@"; fi; }
gradle_() { if [ -x ./gradlew ]; then ./gradlew "$@"; else gradle "$@"; fi; }
conan_ref() {
  conan inspect . --format=json | python3 -c 'import json, sys
d = json.load(sys.stdin)
print(d["name"] + "/" + d["version"] + ("@%s/%s" % (d["user"], d["channel"]) if d.get("user") else ""))'
}

if [ "$action" = local ]; then
  case "$kind" in
    npm)    mkdir -p "$LOCAL_DIR"; npm pack --pack-destination "$LOCAL_DIR" ;;
    pypi)   venv=$(mktemp -d); python3 -m venv "$venv"; "$venv/bin/pip" install --quiet build
            "$venv/bin/python" -m build --outdir "$LOCAL_DIR" ;;
    maven)  mvn_ install -DskipTests ;;
    gradle) gradle_ publishToMavenLocal ;;
    conan)  conan profile detect --exist-ok >/dev/null; conan create . --build=missing ;;
    custom) [ -n "${LOCAL_COMMAND:-}" ] || { echo "registry: LOCAL_COMMAND is empty (ci/registry.env)" >&2; exit 1; }
            bash -c "$LOCAL_COMMAND" ;;
    *)      echo "registry: REGISTRY_KIND=$kind is not handled: use custom (ci/registry.env)" >&2; exit 2 ;;
  esac
  echo "registry: installed locally ($kind)"
  exit 0
fi

if [ "$action" = publish ]; then
  TOKEN=${REGISTRY_PUBLISH_TOKEN:-${CI_JOB_TOKEN:-${GITHUB_TOKEN:-}}}
  [ -n "${REGISTRY_PUBLISH_TOKEN:-}" ] && own=1 || own=0
else
  TOKEN=${REGISTRY_TOKEN:-${CI_JOB_TOKEN:-${GITHUB_TOKEN:-}}}
  [ -n "${REGISTRY_TOKEN:-}" ] && own=1 || own=0
fi
[ -n "$TOKEN" ] || { echo "registry: no token: set REGISTRY_TOKEN (or REGISTRY_PUBLISH_TOKEN to publish)" >&2; exit 1; }
USER_=${REGISTRY_USER:-}
if [ -z "$USER_" ]; then
  if [ "$own" = 1 ]; then USER_=token
  elif [ -n "${CI_JOB_TOKEN:-}" ]; then USER_=gitlab-ci-token
  else USER_=x-access-token; fi
fi
# never print the token: GitHub masks it with this command, GitLab masks its variables
[ "${GITHUB_ACTIONS:-}" = true ] && echo "::add-mask::$TOKEN"
umask 077

case "$kind" in
  npm)
    # the committed .npmrc may name the registry for the scope; the token goes only in the user's
    npm config set --location=user "${REGISTRY_SCOPE:+$REGISTRY_SCOPE:}registry" "$REGISTRY_URL"
    npm config set --location=user "//${REGISTRY_URL#*://}:_authToken" "$TOKEN"
    [ "$action" = publish ] && npm publish --registry "$REGISTRY_URL"
    ;;
  pypi)
    if [ "$action" = login ]; then
      # the index URL with the credentials in it, percent-encoded, keeping its scheme
      url=$(U=$USER_ T=$TOKEN python3 -c 'import os, sys, urllib.parse as u
s, rest = sys.argv[1].split("://", 1)
print(f"{s}://{u.quote(os.environ['"'"'U'"'"'], safe="")}:{u.quote(os.environ['"'"'T'"'"'], safe="")}@{rest}")' "$REGISTRY_URL")
      python3 -m pip config --user set global.extra-index-url "$url" >/dev/null
    else
      venv=$(mktemp -d)
      python3 -m venv "$venv"
      "$venv/bin/pip" install --quiet build twine
      out=$(mktemp -d)      # only this build: never old files left in dist/
      "$venv/bin/python" -m build --outdir "$out"
      TWINE_USERNAME=$USER_ TWINE_PASSWORD=$TOKEN \
        "$venv/bin/python" -m twine upload --repository-url "${REGISTRY_UPLOAD_URL:-$REGISTRY_URL}" "$out"/*
    fi
    ;;
  maven)
    # user-level settings.xml, outside the repository; pom.xml names the same <id>.
    # On a CI runner (CI=true) it replaces the one actions/setup-java writes; on your
    # computer one of yours is never overwritten: add the server to it, with the
    # token from the environment.
    f=~/.m2/settings.xml
    if [ -f "$f" ] && [ "${CI:-}" != true ] && ! grep -q 'written by ci/registry.sh' "$f"; then
      echo "registry: $f is yours: add <server><id>$ID</id><username>$USER_</username><password>\${env.REGISTRY_TOKEN}</password></server> to it" >&2
      exit 1
    fi
    mkdir -p ~/.m2
    esc() { sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g' <<<"$1"; }
    printf '<!-- written by ci/registry.sh -->\n<settings><servers><server><id>%s</id><username>%s</username><password>%s</password></server></servers></settings>\n' \
      "$ID" "$(esc "$USER_")" "$(esc "$TOKEN")" > "$f"
    [ "$action" = publish ] && mvn_ deploy -DskipTests
    ;;
  gradle)
    # the repository named $ID in build.gradle uses credentials(PasswordCredentials):
    # Gradle reads ${ID}Username and ${ID}Password from the user's gradle.properties
    d=${GRADLE_USER_HOME:-$HOME/.gradle}; f=$d/gradle.properties
    mkdir -p "$d"; touch "$f"
    grep -v -e "^${ID}Username=" -e "^${ID}Password=" "$f" > "$f.new" || true
    printf '%sUsername=%s\n%sPassword=%s\n' "$ID" "$USER_" "$ID" "$TOKEN" >> "$f.new"
    mv "$f.new" "$f"
    # publish: also as project properties from the environment, whatever home Gradle uses
    if [ "$action" = publish ]; then
      ( export "ORG_GRADLE_PROJECT_${ID}Username=$USER_" "ORG_GRADLE_PROJECT_${ID}Password=$TOKEN"; gradle_ publish )
    fi
    ;;
  conan)
    # credentials stay in Conan's home (CONAN_HOME, ~/.conan2 by default)
    conan remote add --force "$ID" "$REGISTRY_URL"
    conan remote login "$ID" "$USER_" -p "$TOKEN" >/dev/null
    if [ "$action" = publish ]; then
      conan profile detect --exist-ok >/dev/null
      conan create . --build=missing
      conan upload "$(conan_ref)" -r "$ID" --confirm
    fi
    ;;
  custom)
    # any other package manager (cargo, Go, NuGet, Helm...): the commands of ci/registry.env,
    # which read the token from REGISTRY_AUTH_TOKEN and never print it
    cmd=$([ "$action" = login ] && echo "${LOGIN_COMMAND:-}" || echo "${PUBLISH_COMMAND:-}")
    [ -n "$cmd" ] || { echo "registry: the $action command is empty (ci/registry.env)" >&2; exit 1; }
    REGISTRY_AUTH_USER=$USER_ REGISTRY_AUTH_TOKEN=$TOKEN bash -c "$cmd"
    ;;
  *)
    echo "registry: REGISTRY_KIND=$kind is not handled: use custom (ci/registry.env)" >&2
    exit 2
    ;;
esac
echo "registry: $action done ($kind, $REGISTRY_URL)"
