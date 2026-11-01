#!/bin/bash
# scripts/hooks/security-scope.sh
# Lets the security agent reach only the hosts listed in docs/roles/security-scope.txt.
# A guardrail, not a sandbox: for real isolation run the agent where the
# network only reaches local and staging.

command -v jq >/dev/null || { echo "Blocked: jq is not installed, so this hook cannot check the call. Install jq." >&2; exit 2; }   # never fail open
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

SCOPE_FILE="${CLAUDE_PROJECT_DIR:-.}/docs/roles/security-scope.txt"
ALLOWED=$(grep -vE '^[[:space:]]*(#|$)' "$SCOPE_FILE" 2>/dev/null | sed -E 's/[[:blank:]]+//g; /^$/d')
[ -z "$ALLOWED" ] && ALLOWED=$(printf 'localhost\n127.0.0.1')

# every host that appears in a URL must be in scope
HOSTS=$(echo "$CMD" | grep -oE '[a-zA-Z][a-zA-Z0-9+.-]*://[^/:?#"'"'"'[:space:]]+' | sed -E 's#^[^:]+://##; s#^.*@##' | sort -u)
# and the hosts written without a scheme after an HTTP tool (curl example.com,
# wget 10.0.0.5:8080/x); words that look like file names are not hosts
if echo "$CMD" | grep -qE '(^|[;&|[:space:]])(curl|wget|http|https|xh|httpie|nuclei|nikto|ffuf|sqlmap|zap[a-z.-]*)([[:space:]]|$)'; then
  BARE=$(echo "$CMD" | tr -s '[:space:]"'"'"'=' '\n' | grep -vE '^-|://' \
    | grep -E '^([A-Za-z0-9-]+\.)+[A-Za-z]{2,}(:[0-9]+)?(/|$)|^[0-9]+(\.[0-9]+){3}(:[0-9]+)?(/|$)|^[A-Za-z0-9.-]+:[0-9]+(/|$)' \
    | grep -viE '^[^/:]+\.(json|ya?ml|txt|md|html?|xml|csv|log|har|sh|py|js|ts|out|pem|crt|key|conf|cfg|ini|toml|sarif|zip|gz|tar)(/|$)' \
    | sed -E 's#[:/].*$##')
  HOSTS=$(printf '%s\n%s\n' "$HOSTS" "$BARE" | sed '/^$/d' | sort -u)
fi
for h in $HOSTS; do
  if ! echo "$ALLOWED" | grep -qxF "$h"; then
    echo "Blocked: $h is not in docs/roles/security-scope.txt." >&2
    echo "Test only in-scope hosts (local or staging). Ask the user if another host is needed." >&2
    exit 2
  fi
done

# no port scanners, brute-force tools or remote shells
if echo "$CMD" | grep -qE '(^|[;&|[:space:]])(nmap|masscan|hydra|medusa|nc|ncat|socat|ssh|telnet)([[:space:]]|$)'; then
  echo "Blocked: use HTTP tooling against in-scope URLs; scanners, brute-force tools and remote shells are not allowed." >&2
  exit 2
fi
exit 0
