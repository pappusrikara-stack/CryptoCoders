# CryptoCoders: Toggle Wars (Flagsmith Experimentation Hackathon)

One project with two parts that work together:

| | What | Where |
|---|---|---|
| **Flagsmith Lab** (Track 03) | Self-hosted Flagsmith **with Experimentation working**, in one command (`./lab/lab up`), plus a live terminal dashboard of flags and experiments across environments | [`lab/`](lab/README.md) |
| **`flagsmith-experiment` Agent Skill** (Track 04) | Takes a coding agent from "test whether X beats Y" to the winner shipped, the dead code removed and the flag archived, with approval gates and rollback | [`skills/flagsmith-experiment/`](skills/flagsmith-experiment/SKILL.md) |

The skill runs against Flagsmith Cloud or the self-hosted lab. Quick start:
```bash
./lab/lab up                    # self-hosted Flagsmith + experiments, ready in ~2 min
eval "$(./lab/lab env)"         # point the Flagsmith CLI at it
./lab/lab dash                  # watch flags and experiments live
```

```
lab/                    Flagsmith Lab: compose file, `lab` command, terminal dashboard
skills/flagsmith-experiment/
  SKILL.md              ~1k tokens, the whole workflow in 4 phases
  references/sdk.md     per-language snippets, loaded only when editing code
  scripts/              one script per step, each prints one key=value line
site/                   a live web page that A/B tests itself (submission helper)
demo-app/               a tiny signup page with no flags (the skill's test subject)
bench/                  traffic simulator + with/without-skill token benchmark
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
- [x] A draft experiment's split applies to live traffic as soon as it is created (before start). The skill therefore creates drafts at 0% rollout and raises the rollout via the undocumented `PATCH .../experiments/<id>/rollout/` only after an approved start.
- [x] If the environment's name can't be confirmed, the scripts treat it as production (fail-safe)
- [x] `flag update` needs `--yes` without a TTY, so scripts add it only after the skill's own approval gate
- [x] Free Cloud plan supports experiments with the managed warehouse
- [x] Self-hosted (Flagsmith Lab): full experiment end to end: dark draft, approved start, 1000 users, `verdict=ship:short`, ship, kill switch (`kill.sh`: variant traffic 10/20 → 0/20)
- [x] Flagsmith's experiment pause keeps serving the variant, so `kill.sh` sets the rollout to 0% first, then pauses
- [x] Results payload with real data: `results.sh` prints one line per variant plus a `verdict=` line (tested with 400 and 1000 simulated users)
