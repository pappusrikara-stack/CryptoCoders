# CryptoCoders: catch broken A/B tests before your users do

**A/B tests usually fail silently.** One wrong capital in an event name, or a flag read the wrong way, and Flagsmith counts zero results. You find out a week later. We built the tools that catch it in two minutes and let an AI agent run the whole experiment safely, on self-hosted Flagsmith or Flagsmith Cloud.

> **Judges, start here**
> | Track | What to look at | Proof |
> |---|---|---|
> | **03 · Build on Open Source Flagsmith** | **[Flagsmith Lab](lab/README.md)**: `./lab/lab up` gives self-hosted Flagsmith with Experimentation in ~80s. `./lab/lab preflight` flies your experiment through your real app in a headless browser and cross-checks what Flagsmith recorded, **with zero changes to your app**. **[A GitHub Action](lab/action.yml)** runs a throwaway self-hosted Flagsmith in CI on every PR and comments a report card. | [PR #1](https://github.com/pappusrikara-stack/CryptoCoders/pull/1): the bot catching a one-capital typo · [React example](examples/react-pricing) |
> | **04 · Flagsmith Agent Skills** | **[`flagsmith-experiment` skill](skills/flagsmith-experiment/SKILL.md)**: a coding agent goes from "test whether X beats Y" to the winner shipped, the dead code removed and the flag archived, with approval gates, a kill switch and rollback | [Benchmark](bench/RESULTS.md): **48% fewer tokens**, and the agent without it failed |

## What preflight catches (real output)
```
## ❌ Flagsmith preflight failed
| ❌ | Code never sends `checklist_item_checked` | did you mean `Checklist_Item_Checked` (in site/experiments.js)? |
| ✅ | `control`: 34/34 exposures recorded |
| ❌ | `control`: 0/15 conversions counted | conversions happened in the browser but Flagsmith counted none |
```
```
| ❌ | `control`: 0/49 exposures recorded | the app evaluates the flag without recording an exposure: use getExperimentFlag / useExperiment |
```
The second is a stock React app using `useFlags` instead of `useExperiment`. Both were caught with **no code changes** to either app: the headless browser reroutes the SDK's Flagsmith Cloud traffic to the local lab. When the app is correct, every number lines up, e.g. `50/50 exposures`, `18/18 conversions`, a fair split, and both variants really rendering differently.

## Quick start
```bash
./lab/lab up                    # self-hosted Flagsmith + experiments, ready in ~80s
./lab/lab preflight             # fly preflight.config.mjs through your app
./lab/lab dash                  # live terminal dashboard of flags and experiments
eval "$(./lab/lab env)"         # point the Flagsmith CLI (and the skill) at the lab
```
In CI, add three lines ([lab/README.md#github-action](lab/README.md#github-action)):
```yaml
- uses: pappusrikara-stack/CryptoCoders/lab@main
  with: { start: npm start, url: http://localhost:3000/ }
```

## What's in the repo
```
lab/                    Flagsmith Lab: compose file, `lab` command, preflight, dashboard, GitHub Action
skills/flagsmith-experiment/
  SKILL.md              ~1k tokens, the whole workflow in 4 phases
  references/sdk.md     per-language snippets, loaded only when editing code
  scripts/              one script per step, each prints one key=value line
examples/react-pricing/ stock React + Flagsmith React SDK app, preflighted with no changes
site/                   a live page that A/B tests itself (Toggle Wars submission helper)
demo-app/               a tiny signup page with no flags (the skill's test subject)
bench/                  traffic simulator + with/without-skill token benchmark
```

## Things we found in Flagsmith along the way
- **A draft experiment splits live traffic before it's started.** The skill creates drafts at 0% and raises the rollout only after an approved start.
- **Pausing an experiment keeps serving the variant.** The skill's `kill.sh` sets the rollout to 0% first, then pauses.
- **Ending an experiment and changing its rollout** use API endpoints that aren't in the docs (`/complete/`, `/rollout/`). We found them by probing and documented them below.
- **The self-hosting docs say the compose file includes ClickHouse; it doesn't.** The lab uses the documented `flagsmith_database` warehouse instead.

# Agent Skill details (Track 04)

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
