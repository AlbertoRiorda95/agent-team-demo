#!/bin/bash
# scripts/hooks/gate-test.sh
# CUSTOMIZE: the project's test command
if ! npm test --silent > /tmp/test.log 2>&1; then
  echo "Task cannot be closed: the test suite fails." >&2
  tail -n 30 /tmp/test.log >&2
  exit 2
fi
exit 0
