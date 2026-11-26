# Flagsmith Lab: self-hosted A/B testing in one command

Run open-source Flagsmith on your machine with **Experimentation working**, ready for the CLI, the SDKs and coding agents, with no clicking around.

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
| `./lab/lab down` | stop, keep data |
| `./lab/lab reset` | stop and delete all data |

Needs Docker with Compose v2 (4 GB of memory for Docker), bash and curl. On Windows, use Git Bash or WSL. Node 18+ is only needed for `dash`. Port 8000 by default; set `LAB_PORT=9000` before the first `up` to change it.

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
