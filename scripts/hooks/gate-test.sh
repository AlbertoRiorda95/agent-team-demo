#!/bin/bash
# scripts/hooks/gate-test.sh
# The project test command: every workspace and packages/money (AGENTS.md > Commands)
if ! npm test --silent > /tmp/test.log 2>&1; then
  echo "Task cannot be closed: the test suite fails." >&2
  tail -n 30 /tmp/test.log >&2
  exit 2
fi
exit 0
