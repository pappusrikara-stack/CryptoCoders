#!/usr/bin/env bash
# run-bench.sh <label> <with-skill|no-skill> : one headless agent run on a fresh copy of the
# demo shop against a clean Flagsmith Development environment. Writes result-<label>.json.
set -uo pipefail
export PATH="$USERPROFILE/.local/bin:$PATH"
B="$(cd "$(dirname "$0")" && pwd)"; label="$1"; mode="$2"
SKILL="$B/../../CryptoCoders/skills/flagsmith-experiment"
E=api/v1/environments/FGEx4RENy5KDQhMDktqgXZ

# clean Flagsmith Development
cd "$B"
flagsmith --no-input --yes feature delete signup_form >/dev/null 2>&1
for id in $(flagsmith api $E/experiment-metrics/ --jq '.results[].id' 2>/dev/null); do flagsmith api $E/experiment-metrics/$id/ -X DELETE >/dev/null 2>&1; done

# fresh repo
d="$B/runs2/$label"; rm -rf "$d"; mkdir -p "$d"
cp "$B/../demo-app/server.js" "$B/../demo-app/package.json" "$B/../demo-app/flagsmith.json" "$d/"
printf 'node_modules/\n.flagsmith-skill/\n' > "$d/.gitignore"
if [ "$mode" = with-skill ]; then mkdir -p "$d/.claude/skills" && cp -r "$SKILL" "$d/.claude/skills/"; fi
cd "$d" && git init -q -b main && git config core.longpaths true && git config user.email bench@local && git config user.name bench && git add -A && git commit -qm "demo shop"

claude -p "$(cat "$B/prompt.txt")" --output-format json --allowedTools "Bash Read Write Edit Glob Grep Skill" \
  --permission-mode acceptEdits --max-turns 80 > "$B/result-$label.json" 2> "$B/stderr-$label.txt"
node -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')),u=r.usage;console.log('$label',r.subtype,'turns',r.num_turns,'cost',r.total_cost_usd.toFixed(2),'total',u.input_tokens+u.output_tokens+u.cache_read_input_tokens+u.cache_creation_input_tokens,'out',u.output_tokens)" "$B/result-$label.json"
git -C "$d" log --oneline --all | head -3; git -C "$d" branch | tr '\n' ' '; echo
