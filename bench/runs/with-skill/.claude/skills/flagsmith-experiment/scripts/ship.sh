#!/usr/bin/env bash
# ship.sh <experiment_id> <winner_key|control>   (approval-gated)
# Completes the experiment; Flagsmith freezes results and, for a variant, rolls it out to 100%.
. "$(dirname "$0")/_lib.sh"
id="${1:?experiment id}"; need_id "$id"; w="${2:?winner key or control}"
read -r f vid <<<"$(fs api "$API/experiments/$id/" --jq "\"\(.feature.name) \([.feature.multivariate_options[]|select(.key==\"$w\")|.id][0] // \"\")\"")"
[ "$w" = control ] || [ -n "$vid" ] || die "no variant '$w' on $f"
require_approval ship "$id=$w" "complete experiment $id and roll '$w' out to 100% of $f"
rb="$(snapshot "$f")"
if [ "$w" = control ]; then body='{"rollout_decision":"control"}'; else body="{\"rollout_decision\":\"variant\",\"rollout_variant\":$vid}"; fi
st="$(echo "$body" | fs api "$API/experiments/$id/complete/" -X POST --input - --jq '"\(.status) decision=\(.rollout_decision)"')"
now="$(fs flag get "$f" --jq '[.variants[]|"\(.key)=\(.weight)"]|join(",")')"
audit "ship $id $f winner=$w -> $st weights=$now"
echo "shipped=$f:$w status=$st weights=$now rollback=\"$rb\""
