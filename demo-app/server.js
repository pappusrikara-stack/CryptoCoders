// Tiny demo shop with no flags yet. The skill's job: A/B test the signup form
// (6 fields vs 3 fields) tracked by "signup_completed", then ship the winner.
const http = require('http');
const page = `<!doctype html><meta charset="utf-8"><title>Demo shop</title>
<style>body{font:16px system-ui;max-width:420px;margin:60px auto}input,button{display:block;width:100%;margin:6px 0;padding:8px}</style>
<h1>Join Demo Shop</h1>
<form id="signup">
  <input name="email" placeholder="Email" required>
  <input name="password" type="password" placeholder="Password" required>
  <input name="first" placeholder="First name" required>
  <input name="last" placeholder="Last name" required>
  <input name="phone" placeholder="Phone" required>
  <input name="company" placeholder="Company" required>
  <button>Create account</button>
</form>
<p id="done" hidden>Welcome aboard!</p>
<script>
document.getElementById('signup').onsubmit = e => {
  e.preventDefault();
  e.target.hidden = true; document.getElementById('done').hidden = false;
};
</script>`;
http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(page); })
  .listen(process.env.PORT || 3000, () => console.log('demo shop on http://localhost:' + (process.env.PORT || 3000)));
