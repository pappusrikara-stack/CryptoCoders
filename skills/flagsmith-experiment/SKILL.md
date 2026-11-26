---
name: flagsmith-experiment
description: Run a complete A/B experiment with Flagsmith, from "test whether X beats Y" to the winner shipped and the flag cleaned up. Puts the variants behind a multivariate flag, wires exposure and conversion events, creates the metric and experiment, reads results, rolls out the winner after human approval, then removes the dead code and archives the flag. Use when asked to A/B test, experiment on, split-test or "prove" a change with Flagsmith.
license: MIT
compatibility: Requires the Flagsmith CLI v2+, bash, git, and gh for the cleanup PR. Flagsmith environment must have a connected warehouse.
metadata:
  author: toggle-wars
  version: "0.1"
---

# Flagsmith experiment: hypothesis to shipped winner

Scripts live in `scripts/` next to this file. Run them with `bash scripts/<name>.sh`.
Each prints one compact `key=value` line. Do not call `flagsmith ... --json` without `--jq`: full JSON wastes tokens.

## Rules (never skip)
- A script that exits `3` printed `NEEDS_APPROVAL: ...`. Show that line to the user, wait for a clear yes, then rerun with the `FS_APPROVE` value it names. Never set `FS_APPROVE` yourself before the user says yes.
- Never pass `--yes` to `flagsmith` yourself; scripts add it only after the approval gate. Never print API keys.
- Before any flag change, the script saves a rollback file and prints `rollback=...`. Keep that command in your reply.
- If something looks wrong mid-experiment (errors, sample ratio warning), run `bash scripts/kill.sh <experiment_id>` (everyone back to control, not gated) and tell the user. After shipping, undo with `bash scripts/rollback.sh <flag>`.
- Self-hosted Flagsmith: export `FLAGSMITH_API_URL` and point the SDK's API and events URLs at it (see `references/sdk.md`).

## Phase 1: Plan (no changes yet)
1. Ask, in one message, only what you cannot infer: what to test (control vs variant), the success event, and the environment. Infer the rest from the code.
2. `bash scripts/context.sh` → checks CLI, auth, bound project/environment, warehouse. Stop and report if `warehouse=none`.
3. Find where the variant would render and where success happens (`grep -rn`). Find how the app identifies users; exposures and conversions must use the same identifier.
4. Write the plan for the user in at most 8 lines: flag name (`snake_case`), variant keys, event name, metric, rollout %, files to change. Wait for a yes.

## Phase 2: Build
5. `bash scripts/create-flag.sh <flag> <variant_key>[=<value>] ...` → creates the flag with `control` as its value plus keyed variants at weight 0. Prints `feature_id` and `variant_ids`.
6. Edit the code, keeping it minimal:
   - init the SDK with events enabled (`enableEvents: true` / `enable_events=True`);
   - identify the user, then `getExperimentFlag('<flag>')` where the variant renders, branch on `flag.variant`;
   - `trackEvent('<event>')` where success happens;
   - flush on exit for server and script SDKs.
   See `references/sdk.md` for each language. Event names are case-sensitive.
7. `bash scripts/create-experiment.sh <flag> <event> "<hypothesis>" [rollout_pct]` → creates the metric and the experiment as a dark draft (0% rollout; Flagsmith would otherwise split live traffic before the start). Prints `experiment_id`.

## Phase 3: Run
8. `bash scripts/start.sh <experiment_id>` (approval-gated). Starts the experiment, then raises the rollout to the target. Starting locks the flag.
9. If the user wants test traffic, write a short script that makes a few hundred identities, gets the flag for each and tracks the event for some, then flushes.
10. `bash scripts/results.sh <experiment_id>` → one line per variant (n, conversions, rate, lift, 95% CI, win probability) and a `verdict=` line. It refreshes at most every 5 minutes. Act only on `verdict=ship:<key>`. For `srm_warning`, report and stop. For `collecting` or `inconclusive`: with simulated traffic, send more users and re-check; with real traffic, report the lines and wait.

## Phase 4: Ship and clean up
11. `bash scripts/ship.sh <experiment_id> <winner_key|control>` (approval-gated) → completes the experiment; Flagsmith freezes results and rolls the winner to 100%. Prints the rollback command.
12. Cleanup on a new branch: replace the flag check with the winning path, delete the losing code and the experiment-only tracking, run the tests, then `gh pr create`. Put the results line and the experiment link in the PR body.
13. After the user confirms the PR is merged and deployed: `bash scripts/archive.sh <flag>` (approval-gated).

Finish with a summary of five lines or fewer: the result, what shipped, the PR link, the rollback command and the audit log path (`.flagsmith-skill/audit.log`).
