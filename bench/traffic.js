#!/usr/bin/env node
// Simulated traffic for a running Flagsmith experiment.
//   node traffic.js <flag> <event> <users> <variant=rate,...>
//   node traffic.js signup_form signup_completed 400 control=0.20,short=0.32
// Each simulated user gets its own identity, is exposed via getExperimentFlag,
// and converts with the rate given for the variant it landed in.
const fs = require('fs');
const path = require('path');
const { Flagsmith } = require('@flagsmith/nodejs');

const [flag, event, usersArg = '300', ratesArg = 'control=0.2'] = process.argv.slice(2);
if (!flag || !event) {
  console.error('usage: node traffic.js <flag> <event> <users> <variant=rate,...>');
  process.exit(1);
}
const rates = Object.fromEntries(ratesArg.split(',').map(kv => {
  const [k, v] = kv.split('=');
  return [k, Number(v)];
}));

function envKey() {
  if (process.env.FLAGSMITH_ENVIRONMENT) return process.env.FLAGSMITH_ENVIRONMENT;
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    const f = path.join(dir, 'flagsmith.json');
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')).environment;
    if (path.dirname(dir) === dir) break;
  }
  throw new Error('set FLAGSMITH_ENVIRONMENT or run from a folder with flagsmith.json');
}

async function main() {
  // Self-hosted (e.g. the lab): FLAGSMITH_API_URL=http://localhost:8000
  const base = process.env.FLAGSMITH_API_URL?.replace(/\/$/, '');
  const client = new Flagsmith({
    environmentKey: envKey(),
    enableEvents: true,
    ...(base && { apiUrl: `${base}/api/v1/`, eventProcessorConfig: { eventsApiUrl: `${base}/api/` } }),
  });
  const run = Date.now().toString(36);
  const stats = {};
  const users = Number(usersArg);
  let next = 0;

  async function worker() {
    while (next < users) {
      const id = `sim-${run}-${next++}`;
      const f = await client.getExperimentFlag(flag, id);
      const variant = f.variant || 'control';
      const s = (stats[variant] ??= { exposed: 0, converted: 0, enrolled: 0 });
      s.exposed++;
      if (f.experiment?.inExperiment) s.enrolled++;
      if (Math.random() < (rates[variant] ?? rates.control ?? 0)) {
        client.trackEvent(event, { identifier: id });
        s.converted++;
      }
    }
  }

  await Promise.all(Array.from({ length: 10 }, worker));
  await client.flushEvents();
  await client.close();
  const line = Object.entries(stats)
    .map(([v, s]) => `${v}:${s.converted}/${s.exposed}(enrolled ${s.enrolled})`)
    .join(' ');
  console.log(`run=${run} users=${users} ${line}`);
}

main().catch(e => { console.error('error=' + e.message); process.exit(1); });
