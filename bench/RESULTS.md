# Token benchmark: with vs without the skill

Same task, same prompt ([prompt.txt](prompt.txt)), same model (Claude Code headless, `claude-sonnet-5-5`), same clean Flagsmith Development environment, same starting repo. Run on 2026-11-26.

> A/B test the demo shop's signup form (6 fields vs 3), simulate ~1000 users, read the results, ship the winner, remove the losing code, commit on a branch, archive the flag.

| | **With skill** | Without skill | Difference |
|---|---|---|---|
| Finished the whole job | **Yes**: shipped, cleaned up, committed, archived | **No**: stuck, Flagsmith never received its events | |
| Turns | **21** | 35 | 40% fewer |
| Output tokens | **7,964** | 13,127 | 39% fewer |
| Total tokens processed | **1,612,514** | 3,104,101 | 48% fewer |
| Cost | **$0.46** | $0.73 | 37% less |
| Wall time | 9.8 min | 10.1 min | (both include waiting for Flagsmith to compute results) |

Total tokens = input + output + cache reads + cache writes, from `claude -p --output-format json`. Both runs load the same global Claude Code setup, so the fixed overhead is identical.

## Why the run without the skill failed
It never used the SDK's `getExperimentFlag`/`trackEvent`. Instead it hand-wrote HTTP calls to the events API, invented its own exposure event name, and got `This environment does not store events in Flagsmith`. After about 10 minutes and 35 turns it stopped and asked the user to "turn on event storage", but storage was already on. The skill's `references/sdk.md` gives the agent the right three calls up front.

## Where the skill saves tokens
- Each script prints one `key=value` line instead of full CLI JSON or ✓ chatter.
- `results.sh` turns the results payload into three lines and a `verdict=`, so the agent never parses statistics itself.
- `ship.sh` uses the `/complete/` endpoint (undocumented; found by probing), which ends the experiment and rolls the winner out to 100% in one call.

## Earlier run (kept for honesty)
A first run with ~400 users drew an unlucky sample: a 93.9% chance to win, just under the 95% bar. The skill correctly **refused to ship** and stopped (14 turns, $0.36). We raised the simulated traffic to 1000 for both runs so the comparison is like for like. We also added one rule: with simulated traffic, send more users and re-check instead of stopping.

Raw outputs: `result-with-skill.json`, `result-no-skill.json`, `result-with-skill-try1.json`. Both run folders are in `runs/` with their git history.
