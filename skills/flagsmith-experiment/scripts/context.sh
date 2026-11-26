#!/usr/bin/env bash
# One line: is everything ready for an experiment?
command -v flagsmith >/dev/null || { echo "error=flagsmith CLI missing; install: curl -fsSL https://get.flagsmith.com | sh"; exit 1; }
. "$(dirname "$0")/_lib.sh"
ver="$(flagsmith --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
[ "${ver%%.*}" -ge 2 ] 2>/dev/null || die "CLI v2+ required (have ${ver:-?})"
fs auth status >/dev/null 2>&1 || [ -n "${FLAGSMITH_API_KEY:-}" ] || die "not logged in; ask the user to run: flagsmith login"
wh="$(fs api "$API/warehouse-connections/" --jq 'if length==0 then "none" else "\(.[0].status) events=\(.[0].total_events_received)" end')"
running="$(fs api "$API/experiments/" --jq '[.results[]|select(.status=="running")|"\(.id):\(.name)"]|join(",")')"
echo "cli=$ver env=$ENV_NAME prod=$(is_prod && echo yes || echo no) warehouse=$wh running=${running:-none}"
