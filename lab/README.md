# Flagsmith Lab: self-hosted A/B testing in one command, and a preflight that catches broken experiments before real users do

1. **`./lab/lab up`** runs open-source Flagsmith on your machine (or in CI) with **Experimentation working**, with no clicking around.
2. **`./lab/lab preflight`** flies your experiment through your *real app* in a headless browser against that throwaway Flagsmith, and tells you if the wiring is broken **before** you launch.
3. **The GitHub Action** does both on every pull request and comments a report card.
4. **`./lab/lab dash`** is a live terminal dashboard of flags and experiments across environments.

> The most common way an experiment fails is silent: the event name differs by one letter or one capital, Flagsmith counts zero conversions, and you find out days later. Preflight finds it in 2 minutes.

```bash
./lab/lab up
```

```
▸ Generating secrets for this machine
▸ Starting containers
▸ Flagsmith is up
▸ Creating admin user
▸ Creating organisation, project and environments
▸ Connecting the experiment warehouse (events stored in the lab's Postgres)
▸ Creating an admin API key for the Flagsmith CLI

Dashboard:   http://localhost:8000  (login: admin@lab.local / <generated>)
Development: BsEj…   Production: eiqo…
SDK config:  API http://localhost:8000/api/v1/   events http://localhost:8000/api/
CLI:         eval "$(./lab/lab env)"; flagsmith flag list -e <key>
```

About 2 minutes on first run (image download), seconds after that.

## Why
Getting self-hosted Flagsmith to the point where you can run an experiment takes a dozen manual steps:
- there is no default login;
- you create the admin, organisation, project, environments, warehouse connection and an API key by hand or through the API;
- the upstream compose file ships with `secret` / `password` as its secrets.

The lab does all of it, and running it again is safe.

## Commands
| | |
|---|---|
| `./lab/lab up` | start + set up (skips setup if already done) |
| `./lab/lab status` | URLs, keys, dashboard login |
| `eval "$(./lab/lab env)"` | point the Flagsmith CLI at the lab |
| `./lab/lab dash` | live terminal dashboard (below) |
| `./lab/lab preflight [config]` | fly your experiments through your real app (below) |
| `./lab/lab down` | stop, keep data |
| `./lab/lab reset` | stop and delete all data |

Needs Docker with Compose v2 (4 GB of memory for Docker), bash and curl. On Windows, use Git Bash or WSL. Node 18+ is only needed for `dash`. Port 8000 by default; set `LAB_PORT=9000` before the first `up` to change it.

## Preflight
```bash
./lab/lab preflight            # reads preflight.config.mjs
```
For each experiment it:
1. creates the flag and experiment in the lab and starts it;
2. **reads your code** to check the metric's event name is actually sent, and suggests the near-miss if it isn't;
3. **sends simulated visitors through your real app** in headless Chromium, each a fresh browser with its own identity, converting at the rates you set;
4. **cross-checks the browser against Flagsmith**: exposures recorded per variant, conversions counted, a fair split (sample-ratio test), the variants really render differently, and no page errors;
5. **estimates the real experiment's size**: users per variant and days at your traffic.

Real output from this repo, with a one-capital typo planted in the event name:
```
## ❌ Flagsmith preflight failed
| ❌ | Code never sends `checklist_item_checked` | did you mean `Checklist_Item_Checked` (in site/experiments.js)? |
| ✅ | `control`: 34/34 exposures recorded |
| ❌ | `control`: 0/15 conversions counted | conversions happened in the browser but Flagsmith counted none |
| ✅ | Fair split (sample-ratio p=0.302) |
| ✅ | Every variant renders differently | control: countdown>checklist · checklist_first: checklist>countdown |
📊 3,756 users per variant, about 19 days at 400/day
```
Fixed, the same run passes: 57/57 exposures and 26/26 conversions for control, 63/63 and 33/33 for the variant.

### Config
```js
// preflight.config.mjs
export default {
  app: 'http://localhost:8787/',   // your app, served locally
  source: ['site'],                // where to look for event names
  visitors: 120,
  experiments: [{
    flag: 'checklist_first', variants: ['checklist_first'], event: 'checklist_item_checked',
    convertRate: { control: 0.4, checklist_first: 0.5 },
    async convert(page) { await page.locator('#items input').first().check(); },   // what a conversion is
    fingerprint: page => page.evaluate(() => document.title),                     // optional: what differs per variant
    baseline: 0.30, expectedLift: 0.10, dailyVisitors: 400,                      // optional: sample-size estimate
  }],
};
```
Your app needs two small hooks:
- When `?fs_api=http://localhost:8000&fs_env=<key>` is present, point the Flagsmith SDK at those, accepting **localhost only**. See [`site/app.js`](../site/app.js), which is 4 lines.
- Set `<html data-flagsmith="ready">` once the visitor is identified and variants are applied, or set `readySelector` in the config.

## GitHub Action
```yaml
# .github/workflows/preflight.yml
on: pull_request
permissions: { contents: read, pull-requests: write }
jobs:
  preflight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pappusrikara-stack/CryptoCoders/lab@main
        with:
          start: npm start                  # serves your app
          url: http://localhost:3000/
```
Each run starts a **throwaway self-hosted Flagsmith inside the CI job**, which is something Flagsmith Cloud can't do per pull request. It then runs preflight, writes the report card to the job summary, comments it on the PR, and fails the check if anything is broken. No secrets are needed.

## `./lab/lab dash`
Example while an experiment is running:
```
 Flagsmith dashboard  http://localhost:8000

 FLAG          Development   Production ⚠
›dark_mode     ● on          ○ off
 signup_form   ● on          ● on

 Experiments
  Development · #1 signup_form running
    control 20.2% of 480   short 33.3% of 520 · 100.0% to win

 ↑↓ flag  ←→ environment  space toggle  r refresh  q quit
```
It shows every flag in every environment and every running experiment's live chance to win. Space toggles the selected flag; Production asks for confirmation first. It drives the Flagsmith CLI, so it works with Flagsmith Cloud too: run `node lab/dash.mjs` with `FLAGSMITH_PROJECT` set.

## What's different from the upstream compose file
Based on [Flagsmith's docker-compose.yml](https://github.com/Flagsmith/flagsmith/blob/main/docker-compose.yml):
- Postgres password, Django secret key and warehouse secret are random per machine (`lab/.env`, gitignored), not hard-coded.
- Experiment events go to the bundled Postgres (`EXPERIMENTATION_ENABLED`, `flagsmith_database` warehouse). That's fine for development; for production, Flagsmith recommends a dedicated warehouse.
- The task processor doesn't publish a second port.
- CLI credentials go to `lab/flagsmith.env` (mode 600, gitignored), never printed into the repo.

## Run an experiment against the lab
With the [flagsmith-experiment skill](../skills/flagsmith-experiment/SKILL.md), a coding agent can do the whole loop. By hand it looks like this:
```bash
eval "$(./lab/lab env)"; export FLAGSMITH_ENVIRONMENT=<Development key>
S=skills/flagsmith-experiment/scripts
bash $S/create-flag.sh signup_form short=3-fields
bash $S/create-experiment.sh signup_form signup_completed "Three fields beat six"
FS_APPROVE=start:1 bash $S/start.sh 1
node bench/traffic.js signup_form signup_completed 1000 control=0.20,short=0.32
bash $S/results.sh 1        # → verdict=ship:short
FS_APPROVE=ship:1=short bash $S/ship.sh 1 short
```
Tested on Flagsmith `latest` (Docker image), CLI v2.0.0, Docker 29 / Compose v5 on Windows 11 with Git Bash.
