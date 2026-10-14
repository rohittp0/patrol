# Patrol telemetry contract

The public Firebase web configuration lives in `src/telemetry/firebase.config.ts`.
There are no service-account credentials. Analytics runs on `https://rohittp.com`
after idle time; local development does not send events by default. Change
documented controls in `src/game/playtest.config.ts` under `telemetry`.

## Research entry point

`src/telemetry/events.ts` is the canonical catalog: event names, descriptions,
emitting modules, parameter definitions, common hunt context, user properties,
and Performance trace definitions. Update the catalog before adding an emitter.
Runtime sanitization discards fields outside each event's allow-list. Tests enforce
GA's 40-character names and 25-parameter limits.

Hunt context includes country, historical case ID, verified setup ID, campaign
position, random attempt ID, moves used/left, and squad count. A restart creates a
new attempt. `level_end` fires once for capture/escape/budget loss; `level_abandon`
distinguishes restart, replay navigation, skip, and country change. Refresh
saves the chase and `game_resume` retains its attempt ID instead of recording
an abandonment. `challenge_previous` identifies replay navigation;
`progress_restore_failed` reports only a categorical invalid/updated-save reason. Thinking duration excludes case/tutorial blocking;
attempt elapsed time includes thinking and briefings. Hidden tabs pause simulation.
Native sharing success means the share API resolved, not confirmed delivery to
another person. Downloads mean a file was handed to the browser, not saved to disk.

Suggested funnels:

- `app_open → tutorial_begin → tutorial_complete/skip → case_intro_start → move_issued`
- `level_start → hint_request → hint_result → hint_followed → level_end`
- `level_end(capture) → history_view → poster_open → poster_ready → poster_download/share_result`
- Compare capture rate, abandonment, moves, hints, and elapsed time by country,
  case, hunt, tier, and release. Placement and move-floor metrics do not guarantee
  every player's perceived difficulty.

Register useful custom event dimensions (country, case_id, challenge_id,
hint_kind, reason, method, capture_region, source) and metrics in GA reporting.
Keep attempt_id for exported event analysis; its high cardinality makes it a poor
aggregate report dimension. Firebase/GA configuration and reporting take place in
the console; this code does not create report definitions or enable BigQuery export.
[Firebase custom event guidance](https://firebase.google.com/docs/analytics/web/events)
and [GA collection limits](https://support.google.com/analytics/answer/9267744?hl=en)
describe these constraints.

## Identity and local profile

`patrol:player:v1` stores only a random UUID, name, and final transparent circular
head crop. Original uploads, filenames, and editing coordinates are not persisted.
Photos never leave the browser unless the player explicitly shares/downloads
their newspaper. Names and images are never event parameters or user properties.

GA forbids sending personal names. Analytics uses the random UUID through its
User-ID API and only `profile_name_set` / `profile_photo_set` yes/no properties.
See [Google's PII policy](https://support.google.com/analytics/answer/6366371/).
No consent UI is included for the owner's internal release. Google signals and
ad personalization are disabled. Query strings are omitted from page location.
Raw error messages and map-provider URLs are excluded from events.

## Debugging and verification

In development, `window.__PATROL_TELEMETRY__.recent` provides a bounded copy of
emitted sanitized packets. `ready` and `performanceReady` show SDK initialization.
Add `?telemetry_debug=1` to opt a local browser into real Firebase initialization
and GA DebugView events. This also opts that session into Performance traces.
Remove the flag for normal local playtests. On production, the debug history is
only exposed with this flag. [Firebase DebugView](https://firebase.google.com/docs/analytics/debugview)
explains console verification.

The SDK loads lazily during idle time, with a documented timeout. Early events
queue up to the configured bound; blocked SDKs, unsupported storage, and network
failures cannot prevent a hunt. Browser tests cover emitted journey packets and
the SDK bridge. Network transmission and console ingestion depend on the target
Firebase/GA project, browser restrictions, and deployment environment.

## Lightweight Performance Monitoring

Ten percent of sessions load Performance Monitoring. Automatic instrumentation
is disabled; only `country_prepare` (fetch/graph/verification) and `poster_prepare`
(first ready render) are recorded, with country as the sole custom attribute.
Retroactive trace recording captures actual work duration even when the SDK loads
later. No trace, timer, or Analytics call runs per animation frame. Movement
events fire on issue, arrival, and resolution. Crop events fire after gestures,
not while dragging. SDK loading is separate from gameplay chunks.
[Firebase Performance web setup](https://firebase.google.com/docs/perf-mon/get-started-web)
documents the SDK.

The Firebase package pins a Node 22-compatible release. A gRPC transitive override
updates unused Firestore/server dependencies to fix npm audit findings; Patrol
imports only app, analytics, and performance, and does not bundle Firestore.
