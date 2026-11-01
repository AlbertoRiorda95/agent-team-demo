#!/bin/sh
# scripts/git-hooks/spec-sync.sh (feature spec-sync, for merges done locally)
# After a commit, merge or pull on the default branch that changed docs/design/,
# bring the issues in line with the specs with scripts/create-issues.py: issues
# for new breakdown rows, and a rewrite of the issues whose row changed while
# their task has not started. It never closes or starts an issue.
# Install once, as both hooks (check first that .git/hooks has no hooks of
# yours with these names):
#   ln -s ../../scripts/git-hooks/spec-sync.sh .git/hooks/post-merge
#   ln -s ../../scripts/git-hooks/spec-sync.sh .git/hooks/post-commit
# A failure is reported and never blocks Git.

branch=$(git rev-parse --abbrev-ref HEAD)
default=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
if [ -z "$default" ]; then
  if git rev-parse --verify --quiet main >/dev/null; then default=main; else default=master; fi
fi
[ "$branch" = "$default" ] || exit 0

case "$(basename "$0")" in
  post-merge) base=ORIG_HEAD ;;
  *) base=HEAD~1 ;;
esac
git rev-parse --verify --quiet "$base" >/dev/null || exit 0
git diff --quiet "$base" HEAD -- docs/design/ && exit 0

echo "spec-sync: docs/design/ changed on $branch, updating the issues"
python3 scripts/create-issues.py || echo "spec-sync: create-issues failed; run python3 scripts/create-issues.py by hand" >&2
exit 0
