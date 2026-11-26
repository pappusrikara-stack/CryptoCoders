# SDK snippets (minimum versions support Experimentation)

Pattern in every language: init with events on → identify → get the experiment flag where the
variant renders (this records the exposure) → track the success event → flush before exit.
Branch on `flag.variant` (the variant key), not on the value.

## Browser JS / React (`@flagsmith/flagsmith` >= 12.4.0)
```js
flagsmith.init({ environmentID: ENV_KEY, enableEvents: true });
await flagsmith.identify(userId);                // anonymous: persistent GUID in localStorage
const flag = flagsmith.getExperimentFlag('FLAG'); // React: const flag = useExperiment('FLAG') (null until loaded)
if (flag?.variant === 'KEY') { /* variant */ } else { /* control */ }
flagsmith.trackEvent('EVENT');                    // where success happens
```
Self-hosted: add `api: '<host>/api/v1/'` and `eventProcessorConfig: { eventsApiUrl: '<events host>/' }`.

## Node.js (`@flagsmith/nodejs` >= 9.1.0)
```js
const fs = new Flagsmith({ environmentKey: ENV_KEY, enableEvents: true });
const flag = await fs.getExperimentFlag('FLAG', userId);
fs.trackEvent('EVENT', { identifier: userId });
await fs.close(); // flush before exit
```

## Python (`flagsmith` >= 6.3.0)
```python
fs = Flagsmith(environment_key=ENV_KEY, enable_events=True)  # scripts: event_processor_config=EventProcessorConfig(max_buffer_items=1)
flag = fs.get_experiment_flag("FLAG", identifier=user_id)
fs.track_event("EVENT", identifier=user_id)
```

## Go (`flagsmith-go-client/v5` >= 5.3.0)
`flagsmith.NewClient(key, flagsmith.WithEvents(ctx))` · `client.GetExperimentFlag(ctx, "FLAG", ec)` ·
`client.TrackEvent("EVENT", &flagsmith.EventOptions{Identifier: id})` · `client.FlushEvents(ctx)`

## Java (`flagsmith-java-client` >= 8.2.0)
`FlagsmithConfig.newBuilder().withEnableEvents(true)` · `getExperimentFlag("FLAG", id)` ·
`trackEvent("EVENT", id, null, null, null)` · `close()`

## Why nothing shows up
No exposures: variant has no key, user not identified, identity outside rollout, process exited before flush.
No conversions: event name differs (case-sensitive), different identifier, event fired before exposure.
