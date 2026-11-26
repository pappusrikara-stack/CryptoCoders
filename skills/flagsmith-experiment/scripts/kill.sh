#!/usr/bin/env bash
# kill.sh <experiment_id> : emergency stop. Everyone goes back to control, counting pauses.
# Not gated: it only moves traffic toward the safe default. Flagsmith's own pause keeps
# serving the variant, so the rollout is set to 0% first.
. "$(dirname "$0")/_lib.sh"
id="${1:?experiment id}"; need_id "$id"
f="$(fs api "$API/experiments/$id/" --jq '.feature.name')"
rollout_body "$f" 0 | fs api "$API/experiments/$id/rollout/" -X PATCH --input - >/dev/null
st="$(fs api "$API/experiments/$id/pause/" -X POST --jq '.status')"
audit "kill $id ($f) rollout=0 status=$st"
echo "killed=$id flag=$f rollout=0% status=$st (resume with an approved start.sh $id)"
