#!/bin/bash
# scripts/hooks/block-infra-commands.sh
# Blocks commands that change real environments, publish a package or a tag, or
# read the package managers' credential files. PreToolUse hook for Claude Code
# (.claude/settings.json) and Codex (.codex/hooks.json): both pass tool_input.command.
# Options may come before the verb (kubectl -n prod apply, npm --registry x publish).

command -v jq >/dev/null || { echo "Blocked: jq is not installed, so this hook cannot check the call. Install jq." >&2; exit 2; }   # never fail open
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

S='[[:space:]]'
A="($S+[^;&|]*)?$S+"     # the tool's options, then the verb, in the same command
E="($S|$|[;&|])"         # end of the verb
FORBIDDEN="terraform${A}(apply|destroy)$E|kubectl${A}(apply|delete|patch|rollout|replace|scale)$E|helm${A}(install|upgrade|uninstall|rollback|push)$E\
|(docker|podman)${A}push$E|aws$S.*$S(create|delete|update|put)-|gcloud$S.*deploy\
|npm${A}(publish|unpublish)$E|(yarn|pnpm|bun)${A}publish$E|twine${A}upload$E|(poetry|uv|flit|hatch)${A}publish$E\
|cargo${A}publish$E|gem${A}push$E|mvnw?$S.*deploy|gradlew?$S.*publish|conan${A}upload$E|dotnet${A}nuget$S+push$E\
|(gh|glab)${A}release$S+(create|upload|edit)$E|registry\.sh$S+publish\
|git${A}push$S.*(--tags|--follow-tags|refs/tags|$S(tag$S|v[0-9]))"
# the credential files ci/registry.sh writes (and the usual ones): agents never read them
H='(~|\$HOME|\$\{HOME\}|/home/[^/[:space:]]+|/root|/Users/[^/[:space:]]+)'
SECRETS="$H/(\.npmrc|\.pypirc|\.netrc|\.config/pip/pip\.conf|\.pip/pip\.conf|\.m2/settings\.xml|\.gradle/gradle\.properties|\.conan2|\.cargo/credentials|\.docker/config\.json)\
|pip3?$S+config$S+(list|get|debug)|-m$S+pip$S+config$S+(list|get|debug)"

if echo "$CMD" | grep -qE "$FORBIDDEN"; then
  echo "Blocked: this command changes a real environment or publishes a package or a tag." >&2
  echo "Write the configuration and propose it in an MR: the pipeline applies it after the merge." >&2
  exit 2
fi
if echo "$CMD" | grep -qE "$SECRETS"; then
  echo "Blocked: this reads a credential file. If a package does not install, say that" >&2
  echo "./ci/registry.sh login is needed and stop (docs/agents/dependencies.md)." >&2
  exit 2
fi
exit 0
