#!/usr/bin/env bash
#
# Cut a branch that follows the convention in CONTRIBUTING.md:
#
#   {type}/{short-description}/{status}
#
#   ./scripts/new-branch.sh feature "admin audit log"
#   ./scripts/new-branch.sh bug "mobile header nav" complete
#
# The description is slugified, so you can type it naturally. The name is
# validated with `git check-ref-format` before the branch is created — git
# rejects spaces and `[ ] ~ ^ : ? * \` in ref names, which is exactly the kind
# of thing you would rather find out here than after typing a commit message.
set -euo pipefail

TYPES="feature bug issue chore docs"
STATUSES="complete in-progress blocked review"

usage() {
  cat <<USAGE
Usage: $0 <type> <description> [status]

  type    one of: ${TYPES}
  status  one of: ${STATUSES}   (default: in-progress)

Example:
  $0 feature "add referral credits" complete
    -> feature/add-referral-credits/complete
USAGE
  exit 1
}

[ $# -ge 2 ] || usage

type="$1"
description="$2"
status="${3:-in-progress}"

grep -qw -- "$type" <<<"$TYPES" || { echo "Unknown type '$type'. Use one of: $TYPES" >&2; exit 1; }
grep -qw -- "$status" <<<"$STATUSES" || { echo "Unknown status '$status'. Use one of: $STATUSES" >&2; exit 1; }

# Lowercase, strip anything that is not a word character, collapse to hyphens.
slug=$(printf '%s' "$description" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')

[ -n "$slug" ] || { echo "Description produced an empty slug." >&2; exit 1; }

branch="${type}/${slug}/${status}"

if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  echo "git rejects '$branch' as a ref name." >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/${branch}"; then
  echo "Branch '$branch' already exists." >&2
  exit 1
fi

git checkout -b "$branch"
echo
echo "On $branch"
echo "Commit with:  git commit -m \"${type}: ${slug//-/ }\""
