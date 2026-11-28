import flagsmith from './vendor/flagsmith-12.6.0.mjs';
import { experiments, EVENTS } from './experiments.js';

// Production client-side key: public by design (it ships in every browser).
// No preflight hooks needed: Flagsmith Lab preflight reroutes this traffic to the lab.
const ENV_KEY = 'b7eCdvaL2KKRd2FHcxignt';
const DEADLINE = new Date('2026-11-29T20:00:00+05:30');

const ITEMS = [
  ['register', 'Every teammate registered', 'Each member needs their own WeMakeDevs registration on the hackathon page.'],
  ['flagsmith', 'Flagsmith is a core part', 'Flags or experiments do real work in the project, not a token mention.'],
  ['track', 'Track(s) chosen', 'You can enter more than one track; you are judged in each one you enter.'],
  ['repo', 'Public GitHub repo', 'Make sure it is public, not private or internal.'],
  ['readme', 'README with setup + how you used Flagsmith', 'Setup steps someone else can follow, plus where Flagsmith fits in.'],
  ['video', 'Short demo video', 'Show the problem, what you built and how Flagsmith fits in.'],
  ['submitted', 'Submitted before the deadline', 'Late submissions are not accepted.'],
];

// ---- countdown ------------------------------------------------------------
const pad = n => String(n).padStart(2, '0');
function tick() {
  const ms = Math.max(0, DEADLINE - Date.now());
  const s = Math.floor(ms / 1000);
  document.getElementById('d').textContent = Math.floor(s / 86400);
  document.getElementById('h').textContent = pad(Math.floor(s / 3600) % 24);
  document.getElementById('m').textContent = pad(Math.floor(s / 60) % 60);
  document.getElementById('s').textContent = pad(s % 60);
}
document.getElementById('local-deadline').textContent =
  DEADLINE.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
tick(); setInterval(tick, 1000);

// ---- checklist --------------------------------------------------------------
const store = JSON.parse(localStorage.getItem('tw-checklist') || '{}');
let firstTickSent = false;
const list = document.getElementById('items');
for (const [id, title, detail] of ITEMS) {
  const li = document.createElement('li');
  li.innerHTML = `<label><input type="checkbox" data-id="${id}"><span><span class="t">${title}</span><span class="d">${detail}</span></span></label>`;
  li.querySelector('input').checked = !!store[id];
  list.append(li);
}
function progress() {
  const done = ITEMS.filter(([id]) => store[id]).length;
  const p = document.getElementById('progress');
  p.textContent = `${done}/${ITEMS.length}`;
  p.classList.toggle('done', done === ITEMS.length);
  return done;
}
progress();
list.addEventListener('change', e => {
  const id = e.target.dataset.id; if (!id) return;
  store[id] = e.target.checked;
  localStorage.setItem('tw-checklist', JSON.stringify(store));
  const done = progress();
  if (e.target.checked && !firstTickSent) { firstTickSent = true; track(EVENTS.checked); }
  if (done === ITEMS.length) track(EVENTS.completed);
});

// ---- Flagsmith: identify, apply experiment variants, track conversions --------
function visitorId() {
  let id = localStorage.getItem('tw-visitor');
  if (!id) { id = 'v-' + crypto.randomUUID(); localStorage.setItem('tw-visitor', id); }
  return id;
}
let ready = false;
const queued = [];
function track(name) {
  if (!ready) { queued.push(name); return; }
  try { flagsmith.trackEvent(name); flagsmith.flushEvents(); } catch { /* Flagsmith down: page still works */ }
}
(async () => {
  try {
    await flagsmith.init({ environmentID: ENV_KEY, enableEvents: true });
    await flagsmith.identify(visitorId());
    for (const [flag, exp] of Object.entries(experiments)) {
      const f = flagsmith.getExperimentFlag(flag); // records the exposure
      exp.apply(f?.variant || 'control');
    }
  } catch (err) {
    console.warn('Flagsmith unavailable; showing control.', err);
  } finally {
    ready = true;
    document.documentElement.dataset.flagsmith = 'ready'; // preflight waits for this
    queued.splice(0).forEach(track);
    addEventListener('pagehide', () => flagsmith.flushEvents());
  }
})();
