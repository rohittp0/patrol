# Patrol telemetry contract

The India campaign sends a small, explicit PostHog funnel with signed-in account properties. The public
project token and privacy controls live in `src/telemetry/posthog.config.ts`.
`COLLECTED_EVENTS` in `src/telemetry/events.ts` is the runtime collection allow-list.
Legacy event definitions remain for unused modules, but are blocked before queueing
and again before transport.

## Current flow

| Events | Purpose |
| --- | --- |
| `app_open`, `page_view` | App entry and home/levels/roster/Academy/gameplay screen transitions. Rerenders and timer ticks do not repeat screen views. |
| `campaign_entry`, `country_load_success`, `country_load_error` | India campaign readiness or categorical initialization failure. |
| `level_briefing` | Case inspection, including locked previews, with level number and locked status. |
| `level_start`, `game_resume` | New attempts versus home/refresh continuation. Start includes squad count, empty slots and deployed specialist ranks. |
| `level_end`, `level_abandon` | Capture/loss and explicit abandonment/replacement. Outcomes include final moves, success and bounded reason; no per-move stream. |
| `guide_begin`, `guide_complete` | Mandatory `field` lesson at Level 1 and `academy` lesson at Level 3. Begin is emitted once per lesson per page load; completion measures time since that begin, including time spent on the lesson. |
| `squad_purchase`, `squad_training` | Successful local recruitment/training. Training includes target rank, game coins spent and configured seconds, excluding deadlines. |
| `reward_awarded` | Verified reward difference, including zero on an equal replay. |
| `sign_in_prompt`, `sign_in_complete` | Optional save-progress funnel; current signed-in account fields are attached, without calling identify. |
| `map_fallback` | Basemap source failure; no provider URLs or errors. |

Game context uses authored level/case identifiers and numeric gameplay facts.
It is refreshed on screen transitions and before outcomes so move counts and
Academy events do not inherit a stale attempt's context. Saves complete in the
background: funnel events represent successful local game actions, not cloud
acknowledgements. Leaving the gameplay screen saves the attempt and is not an
abandonment; hiding/closing a tab emits no abandonment event.

Map pan/zoom, post/squad selections, individual moves, per-frame work, timer ticks,
guide steps, obsolete hints, old skippable tutorials and newspaper edits are not
collected. Only screen transitions and meaningful funnel milestones are emitted.

## Account properties and personless processing

At the owner's request, every gameplay and custom timing event snapshots the
current Firebase Auth account when that event occurs:

| Property | Value |
| --- | --- |
| `signed_in` | `true` for an authenticated account; `false` for anonymous/guest play. |
| `email` | Signed-in account email, when available; at most 254 characters. |
| `name` | Signed-in Firebase display name (primary profile or linked provider), when available; at most 100 characters. |
| `email_verified` | Firebase's email verification status, for signed-in accounts. |
| `auth_provider` | Sign-in provider, e.g. `google.com`, when available. |

Guest events omit account details. The getter reads current Auth state on every
event, so sign-out or an account switch cannot retain the prior account's fields.
Queued events and timing samples retain their original account snapshot even if
sign-in/out happens before the SDK loads. App entry is recorded once, after the
existing Auth/campaign restoration, so returning signed-in players have account
properties on `app_open` as well.

- Email and name are explicit event properties. Such events now contain personal
  data; the technical PostHog personless flags do not make those properties anonymous.
- `person_profiles: 'never'` and outbound `$process_person_profile: false` remain.
  No `identify`, alias, groups or person updates are sent. The filter rejects
  unapproved account fields, Firebase UIDs, credentials, save/attempt IDs,
  photos, filenames, raw errors and URLs.
- PostHog still uses an in-memory random ID per page load and does not reuse
  formerly identified persistence. Refresh rotates that ID. Email can now be used
  as an event-property filter across page loads without creating a person profile.
- IP collection and GeoIP enrichment are disabled. Analytics still makes network
  requests to PostHog; these controls are not a claim that network intermediaries
  cannot observe an IP address.
- Automatic capture, pageviews/pageleaves, exceptions, heatmaps, recording,
  surveys, conversations, feature flags and external extensions are disabled.
- Meta Pixel is no longer initialized or sent events because it can correlate
  browser activity with an advertising identity. Existing legacy Pixel files and
  tests are historical utilities, not part of the active application bundle.
- Existing server-side event/person history is not deleted by this client change.
  Local gameplay saves and Google/Firebase save identity continue independently.

See [PostHog anonymous events](https://posthog.com/docs/data/anonymous-vs-identified-events)
and [SDK persistence](https://posthog.com/docs/libraries/js/persistence).

## Delivery and verification

Normal local development sends no analytics. `?telemetry_debug=1` opts into the
real SDK and marks events `debug_mode: true`; avoid it for ordinary playtests.
`window.__PATROL_TELEMETRY__` exposes bounded sanitized recent events in development
or debug mode. SDK initialization is deferred until idle; early events are queued
up to the tuning limit in `src/game/playtest.config.ts`. Blocked analytics cannot
interrupt the game.

Ten percent of page loads sample the existing custom `country_prepare` and
`poster_prepare` timing events when those operations are measured; debug mode
opts in. They retain actual work timestamps without observers in the frame loop.
No per-frame performance events are collected. These traces also carry an account snapshot and pass the same
transport allow-list.

Unit coverage checks the complete collected-event allow-list, identity and
metadata scrubbing, rejection of retired/noisy/SDK events, and lesson/economy/roster
parameters. `scripts/check-anonymous-analytics.js` verifies the real SDK's outbound
requests, a seeded formerly identified browser, the actual current flow, and
refresh anonymity. Uploads are intercepted so these checks do not create synthetic
production events. Intercepted payloads prove client behavior, not dashboard ingestion.


`scripts/check-account-analytics.js` uses local Firebase emulators and intercepted
real SDK uploads to cover guest entry, account linking, verification/provider
properties, sign-out, another account, restored Auth on refresh, and queued
event/timing snapshots. No fixture emails or names are uploaded to PostHog.
