# Toggle Wars, Track 04: `flagsmith-experiment` Agent Skill

An Agent Skill that takes a coding agent through a full Flagsmith experiment:
hypothesis → flagged variants → metric + experiment → results → winner shipped → dead code removed → flag archived.

```
skills/flagsmith-experiment/
  SKILL.md              ~1k tokens, the whole workflow in 4 phases
  references/sdk.md     per-language snippets, loaded only when editing code
  scripts/              one script per step, each prints one key=value line
demo-app/               a tiny signup page with no flags (the skill's test subject)
```

## Safety design
- Every CLI call is `--no-input`. The CLI needs `--yes` to change flags without a terminal, so scripts add it only after the skill's own approval gate has passed.
- `start`, `ship` and `archive` stop with `NEEDS_APPROVAL` (exit 3) and print the exact token a human must approve. Production environments need a longer token that names the environment.
- Every flag change saves a snapshot first and prints a ready-to-run rollback command. Rollback itself is not gated.
- `archive` refuses while any code still references the flag.
- Every action is appended to `.flagsmith-skill/audit.log`.

## Token efficiency
Scripts filter every CLI response with `--jq`, so the agent sees one line per step instead of full JSON.
Measured on the same task with Claude Code headless ([bench/RESULTS.md](bench/RESULTS.md)):

| | With skill | Without |
|---|---|---|
| Finished the job | **Yes** | No |
| Total tokens | **1.61M** (48% fewer) | 3.10M |
| Output tokens | **7,964** | 13,127 |
| Turns / cost | **21 / $0.46** | 35 / $0.73 |

## Verified against live Flagsmith Cloud (2.295.2, CLI v2.0.0)
- [x] Every script runs end to end in a real environment: create → approval gate → start → results → approval gate → ship → rollback → reference check → archive
- [x] Ending an experiment: `POST .../experiments/<id>/complete/` with `{"rollout_decision":"variant","rollout_variant":<id>}` or `{"rollout_decision":"control"}`. Not in the docs; found by probing. Completing with a variant rolls it out to 100% in the same call.
- [x] `flag update` needs `--yes` without a TTY, so scripts add it only after the skill's own approval gate
- [x] Free Cloud plan supports experiments with the managed warehouse
- [x] Results payload with real data: `results.sh` prints one line per variant plus a `verdict=` line (tested with 400 and 1000 simulated users)
