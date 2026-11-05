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
| `first_squad_purchase` | First successful specialist recruitment in a saved campaign: the new activation/aha milestone. Rejected purchases, training, refresh and later recruits do not emit it. |
| `squad_purchase`, `squad_training` | Successful local recruitment/training. Training includes target rank, game coins spent and configured seconds, excluding deadlines. |
| `reward_awarded` | Verified reward difference, including zero on an equal replay. |
| `sign_in_prompt`, `sign_in_complete` | Optional save-progress funnel; current signed-in account fields are attached, and the Firebase uid becomes the PostHog distinct id. |
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

## Account properties and identity

At the owner's request, every gameplay and custom timing event snapshots the
current Firebase Auth account when that event occurs:

| Property | Value |
| --- | --- |
| `signed_in` | `true` for a signed-in account; `false` for anonymous/guest play. |
| `email` | Signed-in account email, when available; at most 254 characters. |
| `name` | Signed-in Firebase display name (primary profile or linked provider), when available; at most 100 characters. |
| `email_verified` | Firebase's email verification status, for signed-in accounts. |
| `auth_provider` | Sign-in provider, e.g. `google.com`, when available. |

Guest events omit account details. The getter reads current Auth state on every
event, so sign-out or an account switch cannot retain the prior account's fields.
Email and name remain explicit event properties; these events contain personal
data. The Firebase uid is used only as the PostHog identity, never as an event
property named `uid`.

Guests keep one browser-persisted anonymous id across page loads. PostHog uses
`localStorage+cookie` persistence under `patrol_anonymous_v1`; the pre-v2 SDK
default store is never reopened. Signed-in players use their Firebase uid as
PostHog's `distinct_id`, allowing the same account to be recognized across devices.
`onIdTokenChanged` drives identity reconciliation on initial Auth restoration,
Google linking, sign-out and account changes. Linking an anonymous Firebase user
keeps its uid, so a uid-change-only Auth listener would miss that transition.
Repeated notifications for the same identity do nothing.

PostHog uses `person_profiles: 'identified_only'`. The SDK's
`$process_person_profile` and `$is_identified` values survive filtering: guest
processing stays false and identified processing stays true, including on
localhost. `identify(uid)` emits a bounded `$identify` event with identity and
allowed SDK metadata only. `$set` and `$set_once` are removed, so it carries no
person properties, including email or name. Alias, group identification and
standalone person-update events remain blocked.

No PostHog event capture or replay starts until both the SDK is ready and Auth has
resolved. Initialization alone never resets a persisted identity. On resolution,
a confirmed guest resets an identified store; a different signed-in uid resets
that store before identification. Resolving to the same uid, or signing in from an
anonymous store, calls `identify(uid)` without a reset. If Auth has not resolved
within `replayReadyTimeoutMs` (currently 8 seconds) after SDK readiness, telemetry
resolves as a guest and reconciles the store. This also covers campaign startup
failure before the Auth listener exists.

The first identity resolution keeps events queued during startup. Later identity
transitions advance a generation counter; queued events and timing samples from
an earlier generation are discarded at flush instead of being sent under the new
identity. `window.__PATROL_TELEMETRY__.droppedStaleIdentity` exposes that loss in
development/debug mode. SDK loading has no fixed time bound, so a sign-in or
sign-out before delivery becomes ready can drop events from earlier in the page
load. App entry is emitted once per page, after the existing Auth/campaign
restoration; it is not repeated to compensate for a discarded queue entry.

## Attribution, privacy and replay

Every collected gameplay/funnel event carries `app_version: '2.1.0'`, so version
filters also cover level starts and outcomes. The transport retains `utm_source`,
`utm_medium`, `utm_campaign` and `utm_content` for ad-source analysis.
`save_referrer` remains false. Gameplay and `$identify` payloads exclude
`$current_url`, `$referrer`, `$initial_*`, arbitrary URLs, raw errors, credentials,
save/attempt IDs and unapproved account fields. No person properties are sent.

GeoIP enrichment is enabled: events and snapshots no longer force
`$geoip_disable`. The SDK keeps `ip: false`. Analytics still makes network requests
to PostHog; these settings do not hide an IP address from network intermediaries.
Automatic event capture, automatic pageviews/pageleaves, exceptions, heatmaps,
surveys, conversations and feature flags remain disabled. `capture_exceptions`
stays false.

Replay has a separate payload contract. Input masking, URL capture in recordings,
canvas settings and the blocked selectors `#player-photo`, `#crop-editor` and
`#newspaper` are unchanged. Structured `$snapshot` data bypasses the gameplay
property allow-list so recordings remain usable; the no-URL guarantee for
gameplay and `$identify` payloads does not apply to recordings.

Recording is disabled in the initial SDK configuration and starts only after
identity reconciliation. Recordings belong to the Firebase uid while signed in;
for guests, browser identity and replay session state persist across reloads.
Guest-to-sign-in identification keeps the session, so one recording can span the
sign-in. Sign-out and an account switch reset the SDK, rotating both identity and
replay session. Code requests event-trigger re-arming with
`startSessionRecording({ event_trigger: true })` after each applied identity
transition and when a queued `app_open` is discarded as stale. Only the event
trigger is overridden; sampling and other recording rules remain in effect.

**Verification blocker (2026-11-05):** the current project configuration uses V2
trigger groups. SDK 1.438.12's `event_trigger` override writes V1 activation state,
leaving the V2 group pending after sign-out. The new guest identity and session
are correct, but its replay stays buffered. This change is not ready to merge
until that SDK/configuration incompatibility is resolved and browser scenario 3
passes. No SDK upgrade, trigger-setting change or sampling override was applied.

Before flushing queued analytics, initialization waits up to another 8 seconds
for the recorder's listeners, polling every 100 ms. This lets the project's
existing `app_open` trigger see app entry. Gameplay and Meta never wait for these
gates; if replay cannot load, event delivery continues after the bounded wait.
Recorder extensions may load.

Meta Pixel `1412945137121409` is enabled independently of PostHog. It sends one
explicit `PageView` on initialization, plus bounded custom `GameStart`,
`GameResume`, `GameCompleted`, `GameWon`, `TutorialCompleted`, `SquadPurchased`,
`SquadTrainingStarted` and `FirstSquadPurchased` events. Tutorial payloads
distinguish the field and Academy lessons. Meta excludes email, name, UID and
attempt IDs; account properties are attached only to PostHog gameplay/timing
events. Automatic Meta configuration and advanced matching remain off. The live
Meta SDK also emits PageViews around screen transitions; use `GameStart` to count
attempts and `GameWon` to count captures.

Existing server-side event/person history is not deleted by this client change.
Local gameplay saves and Google/Firebase save identity continue independently.

See [PostHog anonymous events](https://posthog.com/docs/data/anonymous-vs-identified-events)
and [SDK persistence](https://posthog.com/docs/libraries/js/persistence).

## Delivery and verification

Normal local development sends no analytics. `?telemetry_debug=1` opts into the
real SDK and marks events `debug_mode: true`; avoid it for ordinary playtests.
`window.__PATROL_TELEMETRY__` exposes bounded sanitized recent events and the stale
identity drop count in development or debug mode. Its `recent` buffer is captured
before SDK enrichment and transport filtering; verify outbound payloads instead.
SDK initialization is deferred until idle; early events are queued
up to the tuning limit in `src/game/playtest.config.ts`. Blocked analytics cannot
interrupt the game.

Ten percent of page loads sample the existing custom `country_prepare` and
`poster_prepare` timing events when those operations are measured; debug mode
opts in. They retain actual work timestamps without observers in the frame loop.
No per-frame gameplay/performance events are collected. Replay independently
records DOM/canvas activity according to the project configuration. Timing traces
carry an account snapshot and use their own unchanged transport allow-list.
Neither trace has an active v2 producer. Although the internal timing packet
includes the version, that separate allow-list strips `app_version` from timing
uploads; the version guarantee applies to collected gameplay/funnel events.

Unit coverage checks the complete collected-event allow-list, identity and
metadata scrubbing, rejection of retired/noisy/SDK events, and lesson/economy/roster
parameters. `scripts/check-replay-and-meta.js` verifies real recorder snapshots,
Meta PageView/gameplay conversions, production/debug gating and provider-failure
isolation. Uploads are intercepted so checks do not create synthetic production
conversions. Intercepted payloads prove client behavior, not dashboard ingestion.
The public PostHog project configuration currently enables recording, including
its existing canvas settings and an `app_open` trigger.
See [session replay installation](https://posthog.com/docs/session-replay/installation).

`scripts/check-account-analytics.js` and `scripts/check-anonymous-analytics.js`
use local Firebase Auth/Firestore emulators and intercepted real SDK uploads.
Together they cover tagged guest entry, persistent guest identity, Google linking
and sign-out with replay rotation, restored Auth, legacy-store isolation, startup
failure and delayed Auth resolution. Google credentials are linked against the
Auth emulator, not production Firebase. Every Meta request and every PostHog POST
upload is fulfilled locally by routes registered before the first navigation.
PostHog GETs for remote configuration and recorder assets may continue, so the
checks can verify real `$snapshot` uploads. Compressed event and snapshot bodies
are decoded from binary request data. No fixture emails or names are uploaded to
PostHog. Per-scenario results and sample payloads are recorded in
[rewrite verification](rewrite-verification.md).

`PosterStudio` is not imported by the v2 app, so `poster_share_result` has no active
producer and remains outside `COLLECTED_EVENTS`. The green-light board's sharing
tile remains a placeholder pending a decision on bringing sharing back.

## Campaign optimization milestones

- **First specialist activation:** Meta `FirstSquadPurchased` (PostHog
  `first_squad_purchase`) fires only after the first validated local recruit.
  It uses the campaign's existing durable `firstPurchase` flag and also excludes
  campaigns already owning a specialist, including legacy saves. It carries the
  squad type, game-coin cost and level context.
- **Level-completion campaigns:** Meta `GameWon` remains unchanged for each
  successful level attempt, including replays; `hunt_number` supports level
  breakdowns. `GameCompleted` remains an attempt-end signal and includes losses
  (`success: 0`), so use `GameWon` when optimizing successful completions.
- `SquadPurchased` still reports every specialist recruit, and training has its
  separate `SquadTrainingStarted` signal. The new milestone is not a standard
  money `Purchase` event: these are game coins, with no currency/revenue value.

After real traffic delivers `FirstSquadPurchased`, confirm it in Meta Events
Manager and select it, or a custom conversion based on it, in the purchase-focused
ad set. Level-focused ad sets can continue using `GameWon`. Adding a pixel event
does not change an existing ad set's optimization choice. No ad-account settings
are changed by the repository deployment.

`check-first-squad-conversion.js` verifies both existing level conversions, a
rejected purchase, first recruit, training/refresh deduplication and later
recruitment using intercepted real Meta SDK uploads.
