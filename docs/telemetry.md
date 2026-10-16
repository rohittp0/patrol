# Patrol telemetry contract

The public PostHog project token and configuration live in `src/telemetry/posthog.config.ts`.
The SDK uses `https://us.i.posthog.com` and defaults dated `2026-05-30`.
There are no service-account credentials. Analytics runs on `https://rohittp.com`
after idle time; local development does not send events by default. Change
documented controls in `src/game/playtest.config.ts` under `telemetry`.

## Research entry point

`src/telemetry/events.ts` is the canonical catalog: event names, descriptions,
emitting modules, parameter definitions, common hunt context, user properties,
and sampled timing event definitions. Update the catalog before adding an emitter.
Runtime sanitization discards fields outside each event's allow-list. Tests enforce
the existing bounded naming and parameter conventions.

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

`campaign_entry` records the opening country as `campaign_start_country`, the
current country, and a bounded source: `device_timezone`, `default`,
`saved_campaign`, or `legacy_progress`. The raw timezone is not collected.
`campaign_start_country` follows subsequent hunt events as common context.
`hunt_number` is relative to that player's remembered country order, so compare
the same case using `country`, `case_id` and `challenge_id`, and segment first-hunt
conversion by opening country. An India-first campaign begins at hunt 1, not 7.

Suggested funnels:

- `app_open → case_intro_start → guide_begin → guide_step_view → guide_complete/skip → level_end`
- Optional reference: `tutorial_begin → tutorial_complete/skip`
- `level_start → hint_request → hint_result → hint_followed → level_end`
- `hint_quota_exhausted → hint_quota_refilled → hint_request`
- Second-hunt win: `level_end(capture) → poster_open(entry=second_country_win) → poster_ready → poster_download/share_result` or `poster_skip → challenge_next(source=newspaper_skip)`
- Opening/tutorial wins, later wins and replays: `level_end(capture) → history_view → result_action(poster) → poster_open(entry=result_button) → poster_ready → poster_download/share_result`
- Compare capture rate, abandonment, moves, hints, and elapsed time by country,
  case, hunt, tier, and release. Placement and move-floor metrics do not guarantee
  every player's perceived difficulty.

The in-game tutorial uses `guide_begin`, `guide_step_view`, `guide_skip`, and
`guide_complete`. Break down step views by `guide_move` and `guide_step` (post,
squad, moving) to find where players stop. A step view means its actual target was
visible; hiding it behind a case card, help, or device gate emits no step view.
Completion means the verified guided capture, while skipping preserves the chase.
The optional slide reference retains the separate `tutorial_*` events.

`hint_request` and `hint_result` include the browser-wide `hints_remaining`.
Only a returned recommendation spends an allowance; errors, cancellations and
no-lead results do not. The fourth recommendation emits `hint_quota_exhausted`
with a 1,800-second cooldown. `hint_quota_refilled` fires when an expired stored
deadline is first observed, including after refresh, rather than at an exact
time while the app is closed. Countdown ticks produce no events. The allowance
is browser-wide and does not reset between hunts or countries.

Every `poster_*` event carries `entry`, `newspaper_version` (currently 3), and
`newspaper_artwork`: `india_v1` for India or `shared_v3` for USA and Hungary.
Compare automatic second-hunt impressions with optional result-card opens,
and compare share/export conversion by design version and artwork. `poster_skip` means the
automatic introduction advances to the next hunt; its reason is `button` or
`escape`. `poster_close` includes that same reason, or `state_change` for cleanup,
and also covers manual dismissal of an optional newspaper. Do not count both
close and skip as separate abandonment actions. Automatic introduction views
are remembered per country, so repeated captures do not inflate that funnel.
Markers from the older first-hunt introduction remain seen; those browsers do
not get a second automatic introduction after this change. Historical events
used `entry=first_country_win`; new automatic introductions use `second_country_win`.

Use event properties such as country, case_id, challenge_id, hint_kind, reason,
method, capture_region, and source to filter and break down PostHog insights.
Keep attempt_id for individual-attempt analysis; its high cardinality makes it a
poor aggregate breakdown. This code does not create dashboards or report definitions.
[PostHog event capture](https://posthog.com/docs/libraries/js/features#capturing-events)
describes custom events and their properties.

## Identity and local profile

`patrol:player:v1` stores only a random UUID, name, and final transparent circular
head crop. Original uploads, filenames, and editing coordinates are not persisted.
Photos never leave the browser unless the player explicitly shares/downloads
their newspaper. Images are never event parameters or person properties.

PostHog uses the existing random UUID through `identify`, with the saved player
`name` and `profile_name_set` / `profile_photo_set` yes/no person properties.
Profile edits update the same identity; clearing the name sets it to null. Names
are person properties rather than gameplay event parameters. Photos are excluded.
[PostHog identity](https://posthog.com/docs/getting-started/identify-users)
describes how events are linked to the same browser-local player.
No consent UI is included for the owner's internal release. Autocapture,
automatic pageviews/pageleaves, exception capture, heatmaps, and automatic
performance instrumentation are disabled. Surveys and conversations are disabled.
Session recording is enabled and started after identification. The SDK can fetch
remote configuration and load the recorder extension. The project's **Record user
sessions** setting must also be enabled; the client respects project sampling and
recording triggers. Inputs remain masked, and photo uploads, crop controls, and the
newspaper canvas are blocked from replay. Replay covers DOM interactions; canvas
pixel recording remains controlled by project settings.
[PostHog session replay installation](https://posthog.com/docs/session-replay/installation)
describes project-side setup.
Referrer and campaign collection are disabled. The send hook also strips SDK
initial/session attribution and URLs from gameplay and identity events, including
query strings and fragments.
Nested person updates retain only the documented name/presence properties and the SDK's
boolean internal/test-user marker. Raw error messages and map-provider URLs are
excluded from events.

## Debugging and verification

In development, `window.__PATROL_TELEMETRY__.recent` provides a bounded copy of
emitted sanitized packets. `ready` and `performanceReady` show SDK initialization.
Add `?telemetry_debug=1` to opt a local browser into real PostHog initialization.
Those gameplay and timing events include `debug_mode: true`; filter on that
property in PostHog's live events. This also opts the session into timing events.
Remove the flag for normal local playtests. On production, the debug history is
only exposed with this flag. Recording follows the same initialization gate, so
ordinary local playtests do not record sessions.

The SDK loads lazily during idle time, with a documented timeout. Early events
queue up to the configured bound; blocked SDKs, unsupported storage, and network
failures cannot prevent a hunt. Browser tests cover emitted journey packets and
the SDK bridge. Network transmission and console ingestion depend on the target
PostHog project, browser restrictions, and deployment environment. Intercepted
browser requests verify payloads locally; they do not prove console ingestion.

## Sampled performance timings

Ten percent of sessions send custom PostHog events for `country_prepare`
(fetch/graph/verification) and `poster_prepare` (first ready render). Each includes
`duration_ms` and, when available, country. Queued timings retain the actual work
duration and completion timestamp even when the SDK loads later. Automatic
performance instrumentation is disabled. Custom gameplay telemetry does not log
per frame; session replay adds SDK observers and upload work when enabled.
Movement events fire on issue, arrival, and resolution. Crop events fire after gestures,
not while dragging. SDK loading is separate from gameplay chunks.
[PostHog configuration](https://posthog.com/docs/libraries/js/config)
documents the SDK controls.
