// Tiny demo shop. The signup form is A/B tested with Flagsmith (flag: signup_form,
// values "control" = 6 fields, "short" = 3 fields). Success event: signup_completed.
const http = require('http');
const crypto = require('crypto');

const ENV_KEY = process.env.FLAGSMITH_ENVIRONMENT_KEY || 'FGEx4RENy5KDQhMDktqgXZ';
const SDK_URL = process.env.FLAGSMITH_SDK_API_URL || 'https://edge.api.flagsmith.com';
const FLAG = 'signup_form';

const sdk = (path, body) => fetch(SDK_URL + path, {
  method: body ? 'POST' : 'GET',
  headers: { 'X-Environment-Key': ENV_KEY, 'content-type': 'application/json' },
  body: body && JSON.stringify(body),
});

// Evaluating the flag for an identity is the exposure; we also send an explicit event.
async function getVariant(identifier) {
  try {
    const r = await sdk('/api/v1/identities/?identifier=' + encodeURIComponent(identifier));
    const f = (await r.json()).flags.find(x => x.feature.name === FLAG);
    return f && f.enabled && f.feature_state_value === 'short' ? 'short' : 'control';
  } catch { return 'control'; } // fail safe to the existing form
}

async function track(event, identifier, extra = {}) {
  try {
    const r = await sdk('/api/v1/events/', { events: [{ event, feature_name: FLAG, identifier,
      timestamp: Date.now(), ...extra }] });
    if (!r.ok) console.error('track failed', r.status, await r.text());
  } catch (e) { console.error('track failed', e.message); }
}

const field = (n, p, t = 'text') => `<input name="${n}" ${t === 'text' ? '' : `type="${t}" `}placeholder="${p}" required>`;
const fields = {
  control: [field('email', 'Email'), field('password', 'Password', 'password'), field('first', 'First name'),
    field('last', 'Last name'), field('phone', 'Phone'), field('company', 'Company')],
  short: [field('email', 'Email'), field('password', 'Password', 'password'), field('first', 'First name')],
};

const page = (variant, id) => `<!doctype html><meta charset="utf-8"><title>Demo shop</title>
<style>body{font:16px system-ui;max-width:420px;margin:60px auto}input,button{display:block;width:100%;margin:6px 0;padding:8px}</style>
<h1>Join Demo Shop</h1>
<form id="signup">
  ${fields[variant].join('\n  ')}
  <button>Create account</button>
</form>
<p id="done" hidden>Welcome aboard!</p>
<script>
document.getElementById('signup').onsubmit = e => {
  e.preventDefault();
  fetch('/signup_completed', { method: 'POST', headers: { 'x-user-id': ${JSON.stringify(id)} } });
  e.target.hidden = true; document.getElementById('done').hidden = false;
};
</script>`;

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/signup_completed') {
    await track('signup_completed', req.headers['x-user-id'] || 'anonymous');
    res.statusCode = 204; return res.end();
  }
  const cookie = /uid=([\w-]+)/.exec(req.headers.cookie || '');
  const id = cookie ? cookie[1] : crypto.randomUUID();
  const variant = await getVariant(id);
  await track('signup_form_exposure', id, { metadata: { variant } });
  res.setHeader('set-cookie', `uid=${id}; Path=/; Max-Age=31536000`);
  res.setHeader('content-type', 'text/html');
  res.end(page(variant, id));
});

if (require.main === module) {
  server.listen(process.env.PORT || 3000, () => console.log('demo shop on http://localhost:' + (process.env.PORT || 3000)));
}
module.exports = { getVariant, track };
