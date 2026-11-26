#!/usr/bin/env bash
# results.sh <experiment_id> : refresh (max once / 5 min), then one line per variant and a verdict.
# Verdict rules match Flagsmith's own: >=50 identities per variant, >=95% chance to win, no SRM.
. "$(dirname "$0")/_lib.sh"
id="${1:?experiment id}"; need_id "$id"; stamp="$STATE_DIR/refresh-$id"
if [ ! -f "$stamp" ] || [ $(( $(date +%s) - $(cat "$stamp") )) -ge 300 ]; then
  fs api "$API/experiments/$id/results/refresh/" -X POST >/dev/null 2>&1 && date +%s >"$stamp" && sleep 5 || true
fi
fs api "$API/experiments/$id/results/" --jq '
  def pct: . * 1000 | round / 10;
  .results as $r | $r.payload.metrics[0] as $m |
  ($m.variants // {}) as $v | ($m.inference // {}) as $i |
  ([$v[] | .n] | min // 0) as $minn |
  ([$i | to_entries[] | select(.value.chance_to_win >= 0.95)] | max_by(.value.chance_to_win) // null) as $best |
  ($v | to_entries[] |
    "\(.key) n=\(.value.n) conv=\(.value.sum) rate=\((.value.sum / ([.value.n,1]|max)) | pct)%" +
    (if $i[.key] then " lift=\($i[.key].lift | pct)% ci=[\($i[.key].ci_low | pct),\($i[.key].ci_high | pct)]% p_win=\($i[.key].chance_to_win | pct)%" else "" end)),
  "verdict=" + (
    if ($v | length) == 0 then "no_data"
    elif $minn < 50 then "collecting (smallest variant n=\($minn), need 50)"
    elif ($r.payload.srm_p_value != null and $r.payload.srm_p_value < 0.01) then "srm_warning (do not act)"
    elif $best != null then "ship:\($best.key)"
    elif ([$i[] | .chance_to_win] | max // 1) <= 0.05 then "ship:control"
    else "inconclusive (keep running)" end) +
  " as_of=\($r.as_of[0:16]) final=\($r.is_final)"'
