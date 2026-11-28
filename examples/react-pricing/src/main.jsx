// A plain React app using Flagsmith's official React SDK.
// Note what's NOT here: nothing for preflight. It talks to Flagsmith Cloud as usual.
import React from 'react';
import { createRoot } from 'react-dom/client';
import flagsmith from '@flagsmith/flagsmith';
import { FlagsmithProvider } from '@flagsmith/flagsmith/react';
import Pricing from './Pricing.jsx';

let visitor = localStorage.getItem('visitor');
if (!visitor) { visitor = crypto.randomUUID(); localStorage.setItem('visitor', visitor); }

createRoot(document.getElementById('root')).render(
  <FlagsmithProvider flagsmith={flagsmith}
    options={{ environmentID: 'FGEx4RENy5KDQhMDktqgXZ', enableEvents: true, identity: visitor }}>
    <Pricing />
  </FlagsmithProvider>,
);
