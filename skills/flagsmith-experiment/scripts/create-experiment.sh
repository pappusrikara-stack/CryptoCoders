#!/usr/bin/env bash
# create-experiment.sh <flag> <event> "<hypothesis>" [rollout_pct=100]
# Creates the metric + experiment, NOT started. Variants share the split evenly with control.
. "$(dirname "$0")/_lib.sh"
f="${1:?flag}"; ev="${2:?event}"; hyp="${3:?hypothesis}"; pct="${4:-100}"
fid="$(fs feature get "$f" --jq '.id')"
ids=($(fs feature variant list "$f" --jq '.[].id'))
[ ${#ids[@]} -ge 1 ] || die "flag $f has no variants"
share=$(( 100 / (${#ids[@]} + 1) ))
# Reuse a metric for this event if one exists, so reruns don't pile up duplicates.
mid="$(fs api "$API/experiment-metrics/" --jq "[.results[]|select(.definition.event==\"$ev\")|.id][0] // empty")"
[ -n "$mid" ] || mid="$(printf '{"name":"%s","aggregation":"occurrence","direction":"up","definition":{"version":1,"event":"%s"}}' "$ev" "$ev" \
  | fs api "$API/experiment-metrics/" -X POST --input - --jq '.id')"
mv=""; for id in "${ids[@]}"; do mv="$mv{\"multivariate_feature_option\":$id,\"percentage_allocation\":$share},"; done
bs='\'; hyp_json="${hyp//$bs/$bs$bs}"; hyp_json="${hyp_json//\"/$bs\"}"
eid="$(printf '{"feature":%s,"name":"%s","hypothesis":"%s","metrics":[{"metric":%s,"expected_direction":"increase"}],"experiment_rollout":{"enabled":true,"rollout_percentage":%s,"feature_state_value":{"type":"string","value":"control"},"multivariate_feature_state_values":[%s]}}' \
  "$fid" "$f" "$hyp_json" "$mid" "$pct" "${mv%,}" \
  | fs api "$API/experiments/" -X POST --input - --jq '.id')"
audit "create-experiment $eid flag=$f metric=$mid event=$ev rollout=$pct"
echo "experiment_id=$eid metric_id=$mid split=control+${#ids[@]}x${share}% rollout=${pct}% status=draft"
