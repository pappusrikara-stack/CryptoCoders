#!/usr/bin/env bash
# create-flag.sh <flag> <key>[=<value>] ...   e.g. create-flag.sh signup_form short=3-fields
. "$(dirname "$0")/_lib.sh"
f="${1:?flag name}"; shift; [ $# -ge 1 ] || die "need at least one variant key"
if fs feature get "$f" --jq '.id' >/dev/null 2>&1; then die "flag $f already exists; pick another name"; fi
fs feature create "$f" --value control --enabled --description "Experiment flag (flagsmith-experiment skill)" >/dev/null || die "could not create $f"
for kv in "$@"; do
  k="${kv%%=*}"; v="${kv#*=}"
  [ "$k" = control ] && die "'control' is reserved for the flag's own value"
  fs feature variant add "$f" --key "$k" --value "$v" --weight 0 >/dev/null
done
audit "create-flag $f $*"
fid="$(fs feature get "$f" --jq '.id')"
vids="$(fs feature variant list "$f" --jq '[.[] | "\(.key)=\(.id)"] | join(",")')"
echo "feature_id=$fid variant_ids=$vids"
