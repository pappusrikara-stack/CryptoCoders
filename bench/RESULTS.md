# Token benchmark: with vs without the skill (3 runs each)

Each run used the same task and prompt ([prompt.txt](prompt.txt)), the same model (Claude Code headless, `claude-sonnet-5-5`) and a fresh copy of the same starting repo. Every run started from a clean Flagsmith Development environment. We ran the experiments on 2026-11-26 and 2026-11-27, using [`run-bench.sh`](run-bench.sh).

> A/B test the demo shop's signup form (6 fields vs 3), simulate ~1000 users, read the results, ship the winner, remove the losing code, commit on a branch, archive the flag.

## Average of 3 runs each
| | **With skill** | Without skill | Difference |
|---|---|---|---|
| Finished the whole job | **3 / 3** | 1 / 3 | |
| Total tokens processed | **1.45M** | 3.74M | **61% fewer** |
| Output tokens | **6,754** | 12,670 | 47% fewer |
| Cost | **$0.44** | $0.81 | 46% less |

## Every run
| Run | Finished? | Total tokens | Output tokens | Cost |
|---|---|---|---|---|
| with skill #1 | ✅ shipped, cleaned up, committed, archived | 1,612,514 | 7,964 | $0.46 |
| with skill #2 | ✅ same | 948,475 | 6,070 | $0.37 |
| with skill #3 | ✅ same | 1,782,858 | 6,227 | $0.47 |
| without #1 | ❌ Flagsmith never received its events; stopped | 3,104,101 | 13,127 | $0.73 |
| without #2 | ✅ finished | 5,100,816 | 15,035 | $1.01 |
| without #3 | ❌ same failure as #1; stopped | 3,004,358 | 9,848 | $0.68 |

**How we counted tokens:** total tokens are input + output + cache reads + cache writes, summed from each run's cumulative per-model usage (`modelUsage` in `claude -p --output-format json`). We don't compare turn counts, because some runs used background tasks, which makes the final turn count misleading. Every run loads the same global Claude Code setup, so the fixed overhead is identical in each. Skill run #1 used an earlier version of the skill; #2 and #3 used the current one, with dark drafts and the kill switch.

## Why the runs without the skill fail
In two of three runs the agent never used the SDK's `getExperimentFlag`/`trackEvent`. It hand-wrote HTTP calls to the events API, got `This environment does not store events in Flagsmith`, and stopped. It then asked the user to "turn on event storage", but storage was already on. The run that did finish spent the most of all: 5.1M tokens and $1.01. The skill's `references/sdk.md` gives the agent the right three calls up front. Flagsmith Lab's `preflight` catches this class of mistake automatically.

## Where the skill saves tokens
- Each script prints one `key=value` line instead of full CLI JSON or ✓ chatter.
- `results.sh` turns the results payload into three lines and a `verdict=`, so the agent never parses statistics itself.
- `ship.sh` uses the `/complete/` endpoint, which isn't in the docs and which we found by probing. It ends the experiment and rolls the winner out to 100% in one call.

## Earlier run (kept for honesty)
A first try with ~400 users drew an unlucky sample: a 93.9% chance to win, just under the 95% bar. The skill correctly **refused to ship** and stopped (14 turns, $0.36). We raised the simulated traffic to 1000 for every run above, and added one rule: with simulated traffic, send more users and re-check instead of stopping.

Raw outputs: `result-*.json` (session IDs and local paths redacted). The first runs' git history is in `runs/`.
