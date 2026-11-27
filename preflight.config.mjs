// Preflight config for this repo's site (see lab/README.md#preflight).
// Run: ./lab/lab preflight   (CI: .github/workflows/preflight.yml)
export default {
  app: 'http://localhost:8787/',  // where the app is served during preflight
  source: ['site'],               // scanned for the metric's event name
  visitors: 120,
  experiments: [
    {
      flag: 'checklist_first',
      variants: ['checklist_first'],          // variant keys; 'control' is implicit
      event: 'checklist_item_checked',        // must match the metric exactly
      hypothesis: 'Checklist before countdown gets more first ticks',
      convertRate: { control: 0.4, checklist_first: 0.5 },
      async convert(page) { await page.locator('#items input').first().check(); },
      // what makes the variants visibly different (checked to differ per variant)
      fingerprint: page => page.evaluate(() => [...document.getElementById('blocks').children].map(e => e.id).join('>')),
      baseline: 0.30, expectedLift: 0.10, dailyVisitors: 400,
    },
  ],
};
