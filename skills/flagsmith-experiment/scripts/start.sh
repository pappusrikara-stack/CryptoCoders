#!/usr/bin/env bash
# start.sh <experiment_id> [rollout_pct]   (approval-gated)
# Starts the experiment, then raises the rollout from 0% to the target, so no
# visitor sees a variant before a human approved it.
. "$(dirname "$0")/_lib.sh"
id="${1:?experiment id}"; need_id "$id"
pct="${2:-$(cat "$STATE_DIR/exp-$id.pct" 2>/dev/null || echo 100)}"
f="$(fs api "$API/experiments/$id/" --jq '.feature.name')"
require_approval start "$id" "start experiment $id ($f) at ${pct}% rollout; this locks flag $f and splits live traffic"
st="$(fs api "$API/experiments/$id/start/" -X POST --jq '.status')"
rollout_body "$f" "$pct" | fs api "$API/experiments/$id/rollout/" -X PATCH --input - >/dev/null
audit "start $id status=$st rollout=$pct"
echo "experiment_id=$id status=$st rollout=${pct}%"
