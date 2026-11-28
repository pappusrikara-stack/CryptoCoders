import { useExperiment, useFlagsmith } from '@flagsmith/flagsmith/react';

const PLANS = { monthly: ['Monthly', '$12 / month'], annual: ['Annual', '$99 / year (save 31%)'] };

// Experiment `annual_first`: does showing the annual plan first get more trials started?
export default function Pricing() {
  const flag = useExperiment('annual_first');            // records the exposure
  const flagsmith = useFlagsmith();
  if (!flag) return <p>Loading…</p>;
  const order = flag.variant === 'annual_first' ? ['annual', 'monthly'] : ['monthly', 'annual'];
  return (
    <main style={{ font: '16px system-ui', maxWidth: 520, margin: '60px auto' }}>
      <h1>Pick a plan</h1>
      <div id="plans" style={{ display: 'flex', gap: 12 }}>
        {order.map(p => (
          <section key={p} data-plan={p} style={{ flex: 1, border: '1px solid #ccc', borderRadius: 10, padding: 16 }}>
            <h2>{PLANS[p][0]}</h2><p>{PLANS[p][1]}</p>
          </section>
        ))}
      </div>
      <button id="trial" style={{ marginTop: 16, padding: '10px 16px' }}
        onClick={() => flagsmith.trackEvent('trial_started')}>Start free trial</button>
    </main>
  );
}
