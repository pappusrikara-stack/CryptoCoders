#!/usr/bin/env node
// Flagsmith Lab preflight: fly an experiment through your real app before real users see it.
//
//   ./lab/lab preflight [preflight.config.mjs]
//
// For each experiment in the config it:
//   1. creates the flag + experiment in the lab (self-hosted, throwaway) and starts it,
//   2. checks your source code actually sends the metric's event name,
//   3. sends simulated visitors through your app in a real headless browser,
//   4. cross-checks what the browser did against what Flagsmith recorded
//      (exposures per variant, conversions counted, fair split, variants really differ),
//   5. estimates how many users and days the real experiment needs.
// Prints a report card (Markdown); exits 1 if any check fails.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, 'skills/flagsmith-experiment/scripts');
const API = (process.env.FLAGSMITH_API_URL || '').replace(/\/$/, '');
const ENV = process.env.LAB_DEV_KEY;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API) || !ENV)
  throw new Error('preflight only runs against a local lab: run it via ./lab/lab preflight');

const cfgPath = path.resolve(process.argv[2] || 'preflight.config.mjs');
const cfg = (await import(pathToFileURL(cfgPath))).default;
const VISITORS = Number(process.env.PREFLIGHT_VISITORS || cfg.visitors || 120);
const log = (...a) => console.error('▸', ...a);

// ---- helpers ------------------------------------------------------------------
const env = { ...process.env, FLAGSMITH_ENVIRONMENT: ENV, FS_STATE_DIR: path.join(ROOT, 'lab/.preflight-state') };
async function skill(script, args, approve) {
  const { stdout } = await run('bash', [path.join(SKILL, script), ...args],
    { env: approve ? { ...env, FS_APPROVE: approve } : env, cwd: ROOT, windowsHide: true });
  return stdout.trim();
}
async function fsApi(p, method = 'GET') {
  const { stdout } = await run('flagsmith', ['--no-input', 'api', `api/v1/environments/${ENV}/${p}`, '-X', method],
    { env, windowsHide: true });
  return stdout.trim() ? JSON.parse(stdout) : null;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// chi-square goodness of fit, p-value via Wilson–Hilferty approximation
function srmP(counts) {
  const n = counts.reduce((a, b) => a + b, 0), k = counts.length, e = n / k;
  const chi = counts.reduce((a, c) => a + (c - e) ** 2 / e, 0), df = k - 1;
  const z = (Math.cbrt(chi / df) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 0.5 * (1 - erf(z / Math.SQRT2));
}
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return Math.sign(x) * y; }
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
function sourceStrings(dirs) {
  const out = new Map();
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/^(node_modules|vendor|\.git)$/.test(e.name)) walk(p); }
    else if (/\.(m?[jt]sx?|vue|svelte|html|py|go|java|kt|dart|rb)$/.test(e.name))
      for (const m of fs.readFileSync(p, 'utf8').matchAll(/['"`]([A-Za-z0-9_.:-]{3,60})['"`]/g))
        if (!out.has(m[1])) out.set(m[1], path.relative(process.cwd(), p).split(path.sep).join('/'));
  } };
  for (const d of dirs) walk(path.resolve(process.cwd(), d)); // the app's repo, not the action's
  return out;
}

// ---- run ---------------------------------------------------------------------------
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const cards = []; let failed = false;

for (const x of cfg.experiments) {
  const checks = []; const add = (ok, title, detail = '') => { checks.push({ ok, title, detail }); if (ok === false) failed = true; };
  const keys = ['control', ...x.variants];
  log(`${x.flag}: setting up in the lab`);
  await run('flagsmith', ['--no-input', '--yes', 'feature', 'delete', x.flag], { env, windowsHide: true }).catch(() => {});
  await skill('create-flag.sh', [x.flag, ...x.variants.map(v => `${v}=${v}`)]);
  const eid = (await skill('create-experiment.sh', [x.flag, x.event, x.hypothesis || 'preflight'])).match(/experiment_id=(\d+)/)[1];
  await skill('start.sh', [eid], `start:${eid}`); // lab only: the throwaway instance is the approval boundary

  // 1. static: does the code send the metric's event at all?
  const strs = sourceStrings(cfg.source || ['.']);
  if (strs.has(x.event)) add(true, `Code sends \`${x.event}\``, `found in ${strs.get(x.event)}`);
  else {
    const near = [...strs.keys()].map(s => [s, lev(s.toLowerCase(), x.event.toLowerCase())]).filter(([, d]) => d <= 3).sort((a, b) => a[1] - b[1])[0];
    add(false, `Code never sends \`${x.event}\``, near ? `did you mean \`${near[0]}\` (in ${strs.get(near[0])})? Flagsmith event names are case-sensitive, so conversions would silently count as zero` : 'conversions would silently count as zero');
  }

  // 2. browser: simulated visitors through the real app
  log(`${x.flag}: sending ${VISITORS} visitors through ${cfg.app}`);
  const seen = Object.fromEntries(keys.map(k => [k, { visitors: 0, converted: 0, prints: new Set() }]));
  const errors = new Set(); let next = 0;
  const url = `${cfg.app}${cfg.app.includes('?') ? '&' : '?'}fs_api=${encodeURIComponent(API)}&fs_env=${ENV}`;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < VISITORS) {
      next++;
      const ctx = await browser.newContext(); const page = await ctx.newPage();
      page.on('pageerror', e => errors.add(e.message.split('\n')[0]));
      try {
        await page.goto(url);
        // Wait until the app has identified the visitor and applied variants.
        await page.waitForSelector(cfg.readySelector || 'html[data-flagsmith="ready"]', { state: 'attached', timeout: 15000 });
        const variant = (await page.evaluate(f => window.flagsmith.getAllFlags()[f]?.variant, x.flag)) || 'control';
        const s = seen[variant] ?? (seen[variant] = { visitors: 0, converted: 0, prints: new Set() });
        s.visitors++;
        if (x.fingerprint) s.prints.add(await x.fingerprint(page));
        if (Math.random() < (x.convertRate?.[variant] ?? 0.5)) {
          await x.convert(page, variant); s.converted++;
        }
        await page.evaluate(() => window.flagsmith.flushEvents?.()).catch(() => {});
        await sleep(300);
      } catch (e) { errors.add(e.message.split('\n')[0]); }
      await ctx.close();
    }
  }));

  // 3. Flagsmith's side: what was recorded?
  log(`${x.flag}: waiting for Flagsmith to process events`);
  let rec = {};
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    await fsApi(`experiments/${eid}/results/refresh/`, 'POST').catch(() => {});
    await sleep(2000);
    const r = await fsApi(`experiments/${eid}/results/`).catch(() => null);
    rec = r?.results?.payload?.metrics?.[0]?.variants ?? {};
    const total = Object.values(rec).reduce((a, v) => a + v.n, 0);
    if (total >= 0.95 * VISITORS) break;
  }

  for (const k of keys) {
    const s = seen[k], n = rec[k]?.n ?? 0;
    if (!s.visitors) { add(false, `Variant \`${k}\` never served`, 'no simulated visitor was bucketed into it; check the variant key and the split'); continue; }
    add(n >= 0.9 * s.visitors, `\`${k}\`: ${n}/${s.visitors} exposures recorded`,
      n ? '' : 'the app evaluates the flag without recording an exposure: use getExperimentFlag / useExperiment, identify the user first, and flush before the page closes');
    if (s.converted) {
      const c = rec[k]?.sum ?? 0;
      add(c >= 0.9 * s.converted, `\`${k}\`: ${c}/${s.converted} conversions counted`,
        c ? '' : 'conversions happened in the browser but Flagsmith counted none: event name mismatch, a different identity, or the event fired before the exposure');
    }
  }
  const p = srmP(keys.map(k => seen[k].visitors));
  add(p > 0.001, `Fair split (sample-ratio p=${p.toFixed(3)})`, keys.map(k => `${k} ${seen[k].visitors}`).join(' · '));
  if (x.fingerprint) {
    const pr = keys.map(k => [...seen[k].prints].join('|'));
    add(new Set(pr).size === pr.length, 'Every variant renders differently', keys.map((k, i) => `${k}: ${pr[i] || '?'}`).join(' · '));
  }
  add(errors.size === 0, errors.size ? `${errors.size} page error(s)` : 'No page errors', [...errors].slice(0, 3).join(' / '));

  // 4. how long will the real thing take?
  let plan = '';
  if (x.baseline && x.expectedLift) {
    const p1 = x.baseline, p2 = p1 * (1 + x.expectedLift);
    const perArm = Math.ceil(7.84 * (p1 * (1 - p1) + p2 * (1 - p2)) / (p2 - p1) ** 2);
    const total = perArm * keys.length;
    plan = `To detect a ${Math.round(x.expectedLift * 100)}% lift on a ${(p1 * 100).toFixed(0)}% baseline (80% power, 5% significance): **${perArm.toLocaleString()} users per variant**, ${total.toLocaleString()} in total` +
      (x.dailyVisitors ? `, about **${Math.ceil(total / x.dailyVisitors)} days** at ${x.dailyVisitors}/day.` : '.');
  }
  cards.push({ x, checks, plan });
  await run('flagsmith', ['--no-input', '--yes', 'feature', 'delete', x.flag], { env, windowsHide: true }).catch(() => {});
}
await browser.close();

// ---- report ------------------------------------------------------------------------
const md = [`## ${failed ? '❌' : '✅'} Flagsmith preflight ${failed ? 'failed' : 'passed'}`,
  `Self-hosted Flagsmith (Flagsmith Lab) · ${VISITORS} simulated visitors per experiment in a real browser`, ''];
for (const { x, checks, plan } of cards) {
  md.push(`### \`${x.flag}\` → metric \`${x.event}\``, '| | Check | |', '|---|---|---|');
  for (const c of checks) md.push(`| ${c.ok ? '✅' : '❌'} | ${c.title} | ${c.detail.replace(/\|/g, '\\|')} |`);
  if (plan) md.push('', `📊 ${plan}`);
  md.push('');
}
const report = md.join('\n');
console.log(report);
if (process.env.PREFLIGHT_REPORT) fs.writeFileSync(process.env.PREFLIGHT_REPORT, report);
process.exit(failed ? 1 : 0);
