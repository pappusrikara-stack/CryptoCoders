// Preflight for a stock React app: no changes to the app were needed.
// Run from this folder:  npm run build && npm run preview &  ../../lab/lab preflight
export default {
  app: 'http://localhost:8788/',
  source: ['src'],
  visitors: 100,
  experiments: [{
    flag: 'annual_first',
    variants: ['annual_first'],
    event: 'trial_started',
    convertRate: { control: 0.3, annual_first: 0.4 },
    async convert(page) { await page.click('#trial'); },
    fingerprint: page => page.evaluate(() => [...document.querySelectorAll('[data-plan]')].map(e => e.dataset.plan).join('>')),
    baseline: 0.05, expectedLift: 0.2, dailyVisitors: 2000,
  }],
};
