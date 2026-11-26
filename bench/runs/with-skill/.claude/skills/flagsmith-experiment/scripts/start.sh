#!/usr/bin/env bash
# start.sh <experiment_id>   (approval-gated; locks the flag)
. "$(dirname "$0")/_lib.sh"
id="${1:?experiment id}"; need_id "$id"
name="$(fs api "$API/experiments/$id/" --jq '.name')"
require_approval start "$id" "start experiment $id ($name); this locks flag $name and begins splitting traffic"
st="$(fs api "$API/experiments/$id/start/" -X POST --jq '.status')"
audit "start $id status=$st"
echo "experiment_id=$id status=$st"
