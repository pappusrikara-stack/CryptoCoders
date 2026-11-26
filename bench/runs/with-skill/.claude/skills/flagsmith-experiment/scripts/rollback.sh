#!/usr/bin/env bash
# rollback.sh <flag> [snapshot.state] : restore a snapshot (latest if omitted). Not gated: undo must be fast.
. "$(dirname "$0")/_lib.sh"
f="${1:?flag}"; file="${2:-$(ls -t "$STATE_DIR/rollback/$f-"*.state 2>/dev/null | head -1 || true)}"
[ -f "$file" ] || die "no snapshot for $f"
read -r en w <<<"$(sed -E 's/enabled=([a-z]+) weights=(.*)/\1 \2/' "$file")"
args=(); [ "$en" = true ] && args+=(--enable) || args+=(--disable)
[ -n "$w" ] && args+=(--weight "$w")
fs_write flag update "$f" "${args[@]}" >/dev/null
audit "rollback $f from $file (${args[*]})"
echo "rolled_back=$f from=$file state=\"${args[*]}\""
