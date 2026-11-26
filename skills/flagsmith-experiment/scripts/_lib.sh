# Shared helpers. Sourced by every script; not run directly.
# Design: every call is non-interactive, every output is one short line,
# every write is audited and (when it changes live behaviour) approval-gated.
set -euo pipefail

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${FS_STATE_DIR:-.flagsmith-skill}"
AUDIT="$STATE_DIR/audit.log"
mkdir -p "$STATE_DIR/rollback"

die()  { echo "error=$*" >&2; exit 1; }
need_id() { [[ "${1:-}" =~ ^[0-9]+$ ]] || die "experiment id must be a number (got '${1:-}')"; }

# CLI noise (success ticks, "Think this shouldn't happen?" footers) is dropped
# to save tokens; real errors are kept.
_quiet() { grep -vE '^(✓|Think this|Usage:)' >&2 || true; }

# Never prompt, never open a browser.
fs() { flagsmith --no-input "$@" 2> >(_quiet); }
# The CLI refuses flag changes without a TTY unless --yes is passed. Only call
# this after require_approval (or for rollback), so the human gate stays ours.
fs_write() { flagsmith --no-input --yes "$@" 2> >(_quiet); }

audit() { printf '%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "${ENV_NAME:-?}" "$*" >>"$AUDIT"; }

# Environment key: explicit env var wins, else the one bound by `flagsmith init`.
env_key() {
  if [ -n "${FLAGSMITH_ENVIRONMENT:-}" ]; then echo "$FLAGSMITH_ENVIRONMENT"; return; fi
  [ -f flagsmith.json ] || die "no flagsmith.json; run: flagsmith init --project <p> --environment <key>"
  sed -n 's/.*"environment"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' flagsmith.json | head -1
}

ENV_KEY="$(env_key)"
[ -n "$ENV_KEY" ] || die "could not resolve environment key"
ENV_NAME="$(fs environment get "$ENV_KEY" --jq '.name' 2>/dev/null || echo unknown)"
API="api/v1/environments/$ENV_KEY"

# Fail safe: if the environment's name can't be confirmed, treat it as production.
is_prod() { [ "$ENV_NAME" = unknown ] || echo "$ENV_NAME" | grep -qiE '(^|[^a-z])(prod|production|live|main)([^a-z]|$)'; }

# require_approval <action> <target> <one-line summary>
# Exits 3 with the exact token a human must approve. Production needs a
# longer token that names the environment, so a dev approval can't be reused.
require_approval() {
  local token="$1:$2"
  if is_prod; then token="$token:$ENV_NAME"; fi
  if [ "${FS_APPROVE:-}" != "$token" ]; then
    echo "NEEDS_APPROVAL: $3 [env=$ENV_NAME$(is_prod && echo ' PRODUCTION' || true)] -> rerun with FS_APPROVE='$token'"
    exit 3
  fi
  audit "approved $token"
}

# snapshot <feature>: save current flag state as one line, print the restore command.
snapshot() {
  local f="$1" file
  file="$STATE_DIR/rollback/$f-$(date -u +%Y%m%dT%H%M%SZ).state"
  fs flag get "$f" --jq '"enabled=\(.enabled) weights=\([.variants[]|"\(.key)=\(.weight)"]|join(","))"' >"$file"
  audit "snapshot $f -> $file"
  echo "bash scripts/rollback.sh $f $file"
}

# rollout_body <flag> <pct>: experiment rollout JSON, variants split evenly with control.
rollout_body() {
  local f="$1" pct="$2" ids mv="" share
  ids=($(fs feature variant list "$f" --jq '.[].id'))
  [ ${#ids[@]} -ge 1 ] || die "flag $f has no variants"
  share=$(( 100 / (${#ids[@]} + 1) ))
  for id in "${ids[@]}"; do mv="$mv{\"multivariate_feature_option\":$id,\"percentage_allocation\":$share},"; done
  printf '{"enabled":true,"rollout_percentage":%s,"feature_state_value":{"type":"string","value":"control"},"multivariate_feature_state_values":[%s]}' "$pct" "${mv%,}"
}
