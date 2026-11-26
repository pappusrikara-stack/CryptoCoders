#!/usr/bin/env node
// Flagsmith terminal dashboard: every flag across every environment, plus running
// experiments with their live chance to win. Works with the lab or any Flagsmith
// (it drives the Flagsmith CLI, so it uses whatever the CLI is logged in to).
//
//   ↑/↓ pick a flag   ←/→ pick an environment   space toggle   r refresh   q quit
//   Production toggles ask for confirmation (press y).
//
// Run: ./lab/lab dash   (or: node lab/dash.mjs with FLAGSMITH_PROJECT set)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

const cli = async (args) => {
  const { stdout } = await run('flagsmith', ['--no-input', ...args], { windowsHide: true, maxBuffer: 1 << 24 });
  return stdout.trim() ? JSON.parse(stdout) : null;
};
const isProd = name => /(^|[^a-z])(prod|production|live|main)([^a-z]|$)/i.test(name);

let envs = [], flags = [], states = {}, exps = [];
let row = 0, col = 0, msg = 'loading…', confirm = null, busy = false;

async function refresh() {
  busy = true; draw();
  try {
    envs = (await cli(['environment', 'list', '--json'])).map(e => ({ name: e.name, key: e.api_key }));
    flags = (await cli(['feature', 'list', '--json'])).map(f => f.name).sort();
    states = {}; exps = [];
    await Promise.all(envs.map(async e => {
      const list = await cli(['flag', 'list', '-e', e.key, '--json']);
      for (const f of list) states[`${e.key}/${f.feature ?? f.name}`] = f;
      const ex = await cli(['api', `api/v1/environments/${e.key}/experiments/`, '--json']);
      for (const x of ex.results.filter(x => x.status === 'running' || x.status === 'paused')) {
        let line = 'collecting data';
        try {
          const r = (await cli(['api', `api/v1/environments/${e.key}/experiments/${x.id}/results/`, '--json'])).results;
          const m = r?.payload?.metrics?.[0];
          const v = m?.variants ?? {}, inf = m?.inference ?? {};
          const parts = Object.entries(v).map(([k, s]) =>
            `${k} ${(100 * s.sum / Math.max(s.n, 1)).toFixed(1)}% of ${s.n}` + (inf[k] ? ` · ${(100 * inf[k].chance_to_win).toFixed(1)}% to win` : ''));
          if (parts.length) line = parts.join('   ');
        } catch { /* no results yet */ }
        exps.push({ env: e.name, id: x.id, name: x.name, status: x.status, line });
      }
    }));
    msg = `updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    msg = 'error: ' + (err.stderr?.toString().split('\n')[0] || err.message);
  }
  busy = false; row = Math.min(row, Math.max(flags.length - 1, 0)); col = Math.min(col, Math.max(envs.length - 1, 0)); draw();
}

async function toggle() {
  const f = flags[row], e = envs[col]; if (!f || !e) return;
  const on = states[`${e.key}/${f}`]?.enabled;
  if (isProd(e.name) && confirm !== `${e.key}/${f}`) { confirm = `${e.key}/${f}`; msg = `Turn ${f} ${on ? 'OFF' : 'ON'} in ${e.name.toUpperCase()}? press y to confirm, any key to cancel`; draw(); return; }
  confirm = null; msg = `${on ? 'disabling' : 'enabling'} ${f} in ${e.name}…`; draw();
  try { await run('flagsmith', ['--no-input', '--yes', 'flag', 'update', f, on ? '--disable' : '--enable', '-e', e.key], { windowsHide: true }); }
  catch (err) { msg = 'error: ' + (err.stderr?.toString().split('\n')[0] || err.message); draw(); return; }
  await refresh();
}

const B = s => `\x1b[1m${s}\x1b[22m`, D = s => `\x1b[2m${s}\x1b[22m`, G = s => `\x1b[32m${s}\x1b[39m`, R = s => `\x1b[31m${s}\x1b[39m`, INV = s => `\x1b[7m${s}\x1b[27m`;
const pad = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
function draw() {
  const w = Math.max(...flags.map(f => f.length), 12) + 2, cw = 14;
  const out = ['\x1b[H\x1b[2J', B(' Flagsmith dashboard ') + D(` ${process.env.FLAGSMITH_API_URL || 'https://api.flagsmith.com'}`) + (busy ? D('  ↻') : ''), ''];
  out.push(' ' + pad('FLAG', w) + envs.map(e => pad(isProd(e.name) ? e.name + ' ⚠' : e.name, cw)).join(''));
  flags.forEach((f, i) => {
    const cells = envs.map((e, j) => {
      const s = states[`${e.key}/${f}`];
      let t = !s ? '–' : s.enabled ? '● on' : '○ off';
      if (s?.variants?.length) t += ` ${s.variants.length + 1}v`;
      t = pad(t, cw);
      t = s?.enabled ? G(t) : s ? R(t) : D(t);
      return i === row && j === col ? INV(t) : t;
    });
    out.push((i === row ? '›' : ' ') + pad(f, w) + cells.join(''));
  });
  if (!flags.length) out.push(D('  no flags yet'));
  out.push('', B(' Experiments'));
  if (!exps.length) out.push(D('  none running'));
  for (const x of exps) out.push(`  ${x.env} · #${x.id} ${B(x.name)} ${D(x.status)}`, `    ${x.line}`);
  out.push('', D(' ↑↓ flag  ←→ environment  space toggle  r refresh  q quit'), ' ' + msg);
  process.stdout.write(out.join('\n'));
}

if (!process.stdin.isTTY) { await refresh(); process.stdout.write('\n'); process.exit(0); }
process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
process.stdout.write('\x1b[?25l');
const quit = () => { process.stdout.write('\x1b[?25h\n'); process.exit(0); };
process.stdin.on('data', k => {
  if (confirm && k !== 'y') { confirm = null; msg = 'cancelled'; return draw(); }
  if (k === 'q' || k === '\u0003') return quit();
  if (k === '\u001b[A') row = Math.max(0, row - 1);
  else if (k === '\u001b[B') row = Math.min(flags.length - 1, row + 1);
  else if (k === '\u001b[D') col = Math.max(0, col - 1);
  else if (k === '\u001b[C') col = Math.min(envs.length - 1, col + 1);
  else if (k === ' ' || k === 'y') return void toggle();
  else if (k === 'r') return void refresh();
  draw();
});
await refresh();
setInterval(() => { if (!busy && !confirm) refresh(); }, 10000);
