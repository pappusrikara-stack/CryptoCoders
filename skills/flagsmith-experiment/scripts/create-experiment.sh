#!/usr/bin/env bash
# create-experiment.sh <flag> <event> "<hypothesis>" [rollout_pct=100]
# Creates the metric + experiment as a DARK draft (0% rollout). Flagsmith applies a
# draft's split to live traffic immediately, so the real rollout is only set by
# start.sh after approval. Variants share the split evenly with control.
. "$(dirname "$0")/_lib.sh"
f="${1:?flag}"; ev="${2:?event}"; hyp="${3:?hypothesis}"; pct="${4:-100}"
fid="$(fs feature get "$f" --jq '.id')"
# Reuse a metric for this event if one exists, so reruns don't pile up duplicates.
mid="$(fs api "$API/experiment-metrics/" --jq "[.results[]|select(.definition.event==\"$ev\")|.id][0] // empty")"
[ -n "$mid" ] || mid="$(printf '{"name":"%s","aggregation":"occurrence","direction":"up","definition":{"version":1,"event":"%s"}}' "$ev" "$ev" \
  | fs api "$API/experiment-metrics/" -X POST --input - --jq '.id')"
bs='\'; hyp_json="${hyp//$bs/$bs$bs}"; hyp_json="${hyp_json//\"/$bs\"}"
eid="$(printf '{"feature":%s,"name":"%s","hypothesis":"%s","metrics":[{"metric":%s,"expected_direction":"increase"}],"experiment_rollout":%s}' \
  "$fid" "$f" "$hyp_json" "$mid" "$(rollout_body "$f" 0)" \
  | fs api "$API/experiments/" -X POST --input - --jq '.id')"
echo "$pct" >"$STATE_DIR/exp-$eid.pct"
audit "create-experiment $eid flag=$f metric=$mid event=$ev rollout=0 target=$pct"
echo "experiment_id=$eid metric_id=$mid rollout=0% (dark until start) target=${pct}% status=draft"
