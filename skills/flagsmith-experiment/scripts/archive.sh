#!/usr/bin/env bash
# archive.sh <flag> : archive once the cleanup PR is merged and no code references the flag.
. "$(dirname "$0")/_lib.sh"
f="${1:?flag}"
refs="$(grep -rlF --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.flagsmith-skill --exclude-dir=flagsmith-experiment --exclude='*.md' -- "$f" . 2>/dev/null | head -5 | paste -sd, - || true)"
[ -z "$refs" ] || die "code still references $f in: $refs"
require_approval archive "$f" "archive flag $f (code no longer references it)"
fs_write feature update "$f" --archive >/dev/null
audit "archive $f"
echo "archived=$f"
