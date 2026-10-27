# Progression rewrite verification — 2026-10-26

## Verified locally

- Baseline: 98 tests and production build passed at `0fa0b98` before implementation.
- Rewrite: 106 unit tests passed, covering existing simulation regressions plus
  reward boundaries/differences, duplicate purchases, server-clock training,
  empty rosters, all 15 winning witnesses, affordability, helicopter expiry and
  reuse, continuous firing-radius interception and ability-aware hints.
- Client and Functions TypeScript checks and both production builds passed.
- Firebase emulator integration checks passed: unauthenticated access, forged
  credits, locked levels, illegal moves, duplicate rewards/purchases, stale save
  revisions, interrupted-move restoration, training availability, empty rosters,
  anonymous-to-Google linking and continuing the same save from another app/device.
- Firestore emulator rules checks passed: only owners can get their player save;
  unauthenticated/other-player reads, listing, all direct client writes and receipt
  access are denied.
- Playwright passed 41 checks at 320×568, 390×844, 844×390, 768×1024 and 1440×900:
  layouts, 15 India levels, future slot placeholders, empty-slot selection, guided
  capture, refresh recovery, next-level unlock, recruitment, optional sign-in
  timing, duplicate-purchase prevention and training persistence/unavailability.
  No browser page errors were recorded. Every callback closes its browser context.
- Dependency audits reported zero vulnerabilities for client and Functions
  installations after compatible transitive dependency fixes.

## Campaign acceptance boundaries

The 15 setups have distinct starting nodes and replayed winning command sequences
with their recommended roster and upgrade steps. Each level raises fugitive speed;
progression introduces specialist capabilities and higher recommended upgrades.
The manifest records weaker-roster runs of the same commands separately.

A failed weaker-roster witness does **not** prove that every weaker-roster strategy
fails. Exact global minimum move counts and exhaustive 15-move impossibility
proofs are not claimed. Difficulty ordering and the strength of upgrade incentives
still need human playtests; starter costs, speeds, ranges and unlock levels live
in `src/game/playtest.config.ts`. Initial prices and total available training costs
are checked against minimum first-win earnings before the next specialist unlock,
without assuming repeat farming or 3× rewards.

## Performance evidence

A matched Node.js simulation comparison used the original India opening setup,
identical geography and legacy movement rules, one shared navigation cache, one
cold move and 30 warm replays. The new engine additionally used three individual
Patrol Squad stat records. These are single local samples, not statistical proof
of equivalence or physical-device measurements.

| Measurement | Prototype `0fa0b98` | Rewrite |
| --- | ---: | ---: |
| Navigation preparation | 24.21 ms | 25.04 ms |
| Cold opening move | 91.61 ms | 92.62 ms |
| Warm move median / p95 | 0.073 / 0.314 ms | 0.069 / 0.305 ms |
| Process CPU, 31 samples | 173.37 ms | 175.41 ms |
| JS heap after explicit GC | 18.28 MiB | 18.32 MiB |

A separate rewritten-game Chromium sample used desktop hardware, a 390×844 touch
viewport, Vite development mode and local Firebase emulators. Cache-disabled
readiness was 729.8 ms; cache-enabled readiness was 62.7 ms. The opening move took
1,165 ms wall time, with 8.3 / 9.0 ms median / p95 frame intervals (about 120 median
FPS on this display), 171.4 ms browser task CPU and 36.0 MiB ending JS heap.
These are not production-network latency or phone performance results.

The original production entry JS was 1,197 KB (335 KB gzip). Deferring MapLibre
until gameplay reduced the new entry to about 184 KB (61 KB gzip), plus the
separate map chunk when a level is opened. Map CSS and its worker are deferred
with that module. The existing large-map-chunk build advisory remains.

Reproduce browser sampling with `scripts/check-progression-performance.js`.
Physical iPhone/Android CPU, GPU memory, battery and thermal behavior remain
unverified. These desktop measurements do not establish whole-game performance
on those devices.

## Deployment boundary

Firebase targets `patrol-daac9`; Hosting publishes `dist/` at the custom domain
root. Default Firebase welcome pages and the GitHub Pages deploy workflow are
removed. Anonymous and Google authentication are enabled and
`patrol.rohittp.com` is an authorized Auth domain.

Billing was disabled when checked. The trusted Functions backend requires Blaze
before production deployment. The existing GitHub deployment account's broader
backend deployment permissions also need verification in the live workflow.
Neither local emulator success nor a successful build establishes a production
deployment. Real Google OAuth, production save continuation and map-resource
access from the new domain need live acceptance after the backend is deployed.

## Browser-owned saves update

The user subsequently selected the simpler client-authoritative approach. The
Functions source, dependency lockfile, build script and deployment configuration
are removed. Browser code now performs progression transitions; Firestore stores
one private document per authenticated player. Transactions, mutation IDs and a
local checkpoint journal retain retry and device-conflict recovery.

The earlier server-verification and server-clock observations above describe the
superseded implementation. They do not apply to the simplified release. Its
security boundary is private owner access and basic schema validation, with
player-controlled money/results/clocks intentionally accepted. See ADR-0001.

CI deploys Hosting with its existing permissions; Firestore rules are deployed
using the owner's local Firebase CLI. This removes the need to grant the CI
account Firebase Rules Admin or enable Blaze for Functions.

The simplified version passed 109 unit tests, the direct-Firestore integration
suite and three rules tests (including a full six-squad collection). The same
41 browser checks passed with no page errors against Auth and Firestore emulators.
The integration suite covers retry deduplication, partial-move restoration,
training deadlines, Google account linking and a second simulated device,
including rejection of stale writes.

| Desktop emulation sample | Functions version | Direct Firestore |
| --- | ---: | ---: |
| Cache-disabled readiness | 729.8 ms | 137.8 ms |
| Cache-enabled readiness | 62.7 ms | 59.5 ms |
| Opening move wall time | 1,165 ms | 1,169 ms |
| Median / p95 frame interval | 8.3 / 9.0 ms | 8.3 / 9.3 ms |
| Browser task CPU in move sample | 171.4 ms | 163.2 ms |
| Ending JS heap | 36.0 MiB | 38.7 MiB |
| Production entry JS, gzip | 61 KB | 118 KB |

These are separate single samples with browser cache disabled/enabled, not
controlled server-cache or phone comparisons. Firestore's browser SDK increases
the entry bundle; MapLibre remains deferred until gameplay. No statistical
performance improvement is claimed.

### Live acceptance of the simplified release

Implementation commit `d50e6eb` was pushed to `main`. The local Firebase CLI
successfully deployed Firestore rules/indexes and Hosting without Functions or
a billing upgrade. GitHub run `40372596206` passed validation and automatic
Hosting deployment. The 41 browser checks also passed at
`https://patrol.rohittp.com/`, with PostHog/Meta requests blocked during testing;
production rewards, purchases, training and refresh recovery were exercised in
an isolated anonymous account.

The basemap still uses its fallback on the new domain. A loaded-map check found
that `https://dashboard.lascadian.com/maps/default.json` returns HTTP 200 but no
`Access-Control-Allow-Origin` for `https://patrol.rohittp.com`; the same request
with `https://rohittp.com` or `http://localhost:3000` returns the matching header.
The style host must allow the new origin. The fallback's authoritative geometry,
borders and gameplay remain functional; full basemap acceptance is pending that
upstream configuration change. No embedded map key was copied into source.

## Game interface, tutorials and movement update (2026-10-27)

The interface now uses illustrated wanted cards, SVG squad/navigation icons,
short labels, compact deployment controls and inspectable locked case files.
All 15 cases are distinct, sourced members of the existing illustrated cast;
India encounters are fictional and labelled accordingly. Running speed is the
only opponent gameplay attribute, configured per level in `progressionV2.opponents`.
Starter speeds run from 48 to 116 simulated km/h. Level 3 recommends the first
Rapid upgrade. A late one-move Marksman setup was replaced; the Level 12 witness
now takes four moves. All 15 recommended witnesses replay successfully. Eleven
later witnesses fail with the same moves and basic squads; that is a bounded
comparison, not a proof that every alternative basic-squad strategy is impossible.

The full guide starts when Play opens Level 1 roster selection, then teaches
squad → post → preview → Deploy through the first win. It resumes the saved
move after refresh. Level 2 is unguided; the Level 3 lesson covers Academy,
Rapid purchase, first upgrade and training timer/unavailability. Completion
and skips are private-save fields compatible with earlier saves. No tutorials
appear at Levels 6/10. Minimum first-two-level earnings are 75 coins, covering
25 recruitment + 20 training and leaving 30 without replays.

Movement diagnosis found two concrete predictability gaps. Sampled arrival
reroutes changed heading by up to 60 degrees, without advance notice. More
seriously, the previous four-second animation cap accelerated distant orders.
The long-journey regression failed with "Long order to post 11 changed the runner
playback speed" before the fix and passes with one uniform playback clock.
A detached simulation now previews actual trajectories, arrival turns, travel
floors, firing, escape, distance and endpoint before commitment. Preview/actual
comparisons cover all 40 moves in the 15 winning witnesses under 127 animation
substeps per order, without mutating the playable state.

The HTML includes an animated squad/fugitive chase before application JavaScript
loads, live loading-stage text and a reduced-motion static scene. Map downloads
begin from HTML preloads; the browser verifies a single reused geometry request.
There is no artificial minimum loading delay or invented percentage.

Validation completed locally:

- 116 unit/regression tests and production TypeScript/Vite build.
- Firebase Auth/Firestore integration suite plus four ownership/schema rule tests,
  including existing saves, six-squad evaluation budget and cross-device tutorial flags.
- 67 browser checks: five viewport sizes, locked previews, actual first two wins,
  saved guide resume, purchase login prompt, Academy/training, empty slots and reloads.
- Three gameplay layouts (320×568, 844×390, 390×844): coach and deployment controls
  do not overlap; the guided squad, destination and Deploy are clickable.
- Five loading checks with entry JavaScript held: immediate paint, actual movement,
  reduced motion, immediate transition to game and reused geometry preload.
- Isolated desktop engine sample: first-use forecast median 6.13 ms / p95 25.98 ms;
  800 cached forecasts median 0.030 ms / p95 0.066 ms. This is route-cache cost,
  not end-to-end loading or physical-device evidence.

The earlier direct-Firestore desktop sample recorded 8.3/9.3 ms median/p95 frame
interval and 38.7 MiB heap. The current browser is running at a different refresh
cadence and uses local saves, so these are not controlled before/after timings.
Physical-phone frame rate, CPU and memory remain unverified. Production entry
JavaScript grows from about 118 KB to 126 KB gzip; map code remains deferred.

Current local-save desktop Chromium touch-emulation sample: cache-disabled ready
95.5 ms, cache-enabled ready 51.9 ms; first move 1,186 ms wall time, 70 frame
samples, 16.7/16.8 ms median/p95 frame interval (59.9 median FPS), 57.0 ms browser
task CPU, 26.7 MiB ending JS heap. Production Firebase/network timing is separate.

### Live acceptance

Game commit `f8bb8e0a2927e98491c754635964b89b0234bcf9` was pushed to
`origin/main`. The installed Firebase CLI successfully deployed Hosting,
Firestore rules and indexes. GitHub Actions run
[40407560331](https://github.com/rohittp0/patrol/actions/runs/40407560331)
passed validation and automatic Hosting deployment. The same 67 gameplay checks
and five blocked-entry loading checks passed at `https://patrol.rohittp.com/`
with isolated anonymous saves. The live test explicitly waits for the real
training save to commit before checking the timer; browser-local mutation timing
is not assumed to represent cloud latency.

A production-build desktop Chromium touch-emulation sample measured 9,079.6 ms
cache-disabled readiness and 2,705.6 ms cache-enabled readiness. The animation is
visible before the entry bundle, but these numbers show that campaign startup
still has a meaningful network/authentication/save wait; no startup-speed win is
claimed. First move: 1,183 ms, 68 frames, 16.7/16.8 ms median/p95 frame interval
(59.9 median FPS), 363.2 ms browser task CPU and 30.2 MiB ending JS heap. These
are one cold/warm pair and one move, not physical-phone or statistical evidence.


### Firebase Google popup callback repair (2026-10-27)

The real Google popup regression reproduced the reported failure before the fix:
`redirectUri=https://patrol.rohittp.com/__/auth/handler`,
`redirectMismatch=true`, `accountScreen=false`. `ProgressClient` was overriding
Firebase's exported `authDomain` with the Hosting hostname. Firebase documents
that custom OAuth callbacks require separate provider registration; Hosting alone
does not provide it. The override is removed, keeping the configured Firebase
project callback and existing `GoogleAuthProvider` + `linkWithPopup` account
linking, preserving guest UID/save behavior. No Google Cloud permissions or
OAuth client configuration are changed.

The production bundle was exercised through the real Google/Firebase service
before publishing: the callback became
`https://patrol-daac9.firebaseapp.com/__/auth/handler` and Google's email/phone
sign-in screen appeared. Build and the Auth/Firestore integration suite passed,
including guest account linking, cross-device save continuation and revision
conflict rejection. The browser probe stops before entering credentials and
closes its isolated guest context. Full personal Google sign-in is not claimed.

References: [Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin#customizing-the-redirect-domain-for-google-sign-in),
[Firebase provider linking](https://firebase.google.com/docs/auth/web/account-linking).

## Tactical map, uninterrupted flow and mandatory command guides (2026-10-27)

This release replaces the previous remote style entirely with an app-owned
11-layer tactical style over OpenFreeMap/OpenMapTiles vector data and Noto fonts.
No old map key or style is copied. Attribution stays visible. Acceptance checks
actual rendered vector tiles and place labels, rather than treating successful
style access or the game's own border overlay as a working basemap. A healthy
browser sample loaded four vector tiles and one font without failures. Source,
India tile and font HTTP probes returned 200 with wildcard browser access.
The browser also verifies a missing font keeps the basemap ready, while failure
of the TileJSON source produces an honest playable fallback.

The UI now applies validated campaign actions immediately and queues immutable
snapshots for background persistence (ADR 0002). A held-network repro previously
left Start on the roster after 1.2 seconds. In the final emulator-backed browser
pass, with every cloud response held, Start took 83 ms, recruitment 36 ms and
training 37 ms. Both first wins, rewards, recruitment, training and guide
completion proceeded before acknowledgements. Refresh restored the pending
campaign, then reconnecting persisted the exact 180-coin balance and original
training deadline without duplicate rewards/purchases. Response-lost receipts,
stale device conflicts and immutable attempt IDs have regression coverage.
Selecting a newer cloud campaign fetches it successfully before replacing the
local outbox, retaining a backup. Existing-user Google account switches and
sign-out flush the old identity's pending writes first.

The command-card guide is mandatory at Level 1 and at the Level 3 Academy lesson.
Skip, navigation detours and Escape cannot bypass it. Older unfinished saves
that conflict with the required guide are backed up before returning to the
lesson; deployed squads cannot deadlock the Academy training step. Existing wins
and promised training deadlines remain intact. Hints, both manual focus buttons,
the top information control, their handlers and the active-app hint worker are
removed. Map gestures and automatic framing remain.

Squads/posts can be selected in either order, including the taught move. Switching
squads preserves the destination and recalculates the preview; neither selection
spends a move. Only the current taught post glows. Toasts dismiss after 20 seconds;
a new toast resets its deadline, and manual dismissal still works. Browser clock
checks cover before/after the deadline and replacement-message timing.

The original procedural score and event sounds play only after a gesture. Mute
persists, muted play creates no audio engine, and hidden pages suspend sound.
Browser audio instrumentation verified continuous note scheduling, non-silent
samples, selection effects, muting and hidden-page suspension. Physical phone
speakers/headphones have not been auditioned.

Capture pans/zooms to the actual fugitive and plays a brief gold celebration
before the reward card. The fugitive remains visible above/beside the card on
all tested layouts. Victory shows base × move bonus, net coins and balance
addition, including zero extra payment for equal replays. It has Next and a
secondary Home button with its icon; Academy is absent on wins. Reduced-motion
preferences disable camera/confetti animation. Specialist training now follows
separate increasing real-time ladders: Rapid 30s/1m/3m/10m; Helicopter
15m/30m/1h/2h; Marksman 3h/4h/6h/8h. Each later track starts beyond the prior
track's final duration; these starter values remain centrally tunable.

Local validation:

- 124 unit/regression tests and production build passed.
- Two Auth/Firestore integration tests and four rule tests passed.
- 53 held-cloud gameplay checks, 13 selection/toast/replay checks and nine audio
  checks passed. Five complete tutorial/capture layouts passed at 320×568,
  390×844, 844×390, 768×1024 and 1440×900, with no guide/control overlap or clipped
  Home button. Two legacy-guide fixtures and three map-availability cases passed.
- Desktop Chromium touch-emulation, development/local-save sample with the real
  map and soundtrack: 97.9 ms cache-disabled readiness, 54.7 ms cache-enabled;
  preview interaction 71 ms; first move 1,199 ms; 70 frames; median/p95 frame
  interval 16.7/16.8 ms (59.9 median FPS), browser task CPU 253.5 ms and ending
  JS heap 30.3 MiB. This differs from earlier fallback-map/cloud-save workloads,
  so it is not a controlled performance improvement claim.
- The production entry is about 129 KB gzip. Map code remains deferred; the hint
  worker and audio downloads are absent. Physical-device FPS/CPU/memory and live
  rotation acceptance remain unverified.

Map implementation references: [OpenFreeMap custom styles](https://openfreemap.org/quick_start/)
and [OpenMapTiles schema](https://openmaptiles.org/docs/schema/).


Live release acceptance (2026-10-27):

- Application commit `43b87f09c1a9da9e75c7d4c54b982e716e9d2b25` was pushed
  to `origin/main`. Firebase CLI deployment completed for Hosting, Firestore
  rules and indexes. [CI run 40421925261](https://github.com/rohittp0/patrol/actions/runs/40421925261)
  passed validation and deployment.
- At `https://patrol.rohittp.com/`, 53 held-cloud gameplay checks passed with
  fresh guest saves. Start took 79 ms, recruitment 30 ms and training 36 ms while
  save responses were held. Reconnection preserved the exact balance and
  original training deadline.
- All 13 selection/toast checks, nine audio checks and five loading checks
  passed on the deployed game. The basemap loaded four vector tiles without
  failed resources; blocked-font and blocked-source cases retained their
  expected ready/fallback behavior.
- The live Google popup reached the account screen with the registered Firebase
  callback and no redirect mismatch. Canceling preserved the game. Credential
  entry and complete personal Google sign-in were not automated.
- Browser checks wait for real cloud catch-up and allow training to finish on
  its original deadline during that wait. Toast clock checks use margins around
  the 20-second boundary to avoid assertion overhead crossing a 1 ms window.


## Anonymous campaign analytics (2026-10-27)

The active analytics allow-list now follows screen transitions, case previews,
new/resumed attempts, outcomes, the two mandatory lessons, recruitment/training,
rewards and optional sign-in. It excludes map gestures, selections, individual
moves and legacy hint/slide/crop events. Roster rerenders do not repeat views.
Outcome context refreshes final move counts; training includes its target rank
and configured duration, while level starts record deployed ranks and empty slots.

PostHog no longer identifies the player. Person processing is disabled, its
identity exists only in page memory, and refresh creates a fresh anonymous ID.
Account/profile/save identifiers and SDK identity updates are blocked at the
transport boundary. Replay, surveys, external extensions and Meta initialization
are disabled. This applies to future client events; existing provider history
was not removed. See `docs/telemetry.md` for the current contract.

Validation: 125 unit/regression tests and production build passed; the final
privacy-focused suite passed all six checks. Real-browser acceptance intercepted
the actual SDK uploads and passed 16 checks over two captures, a mid-attempt
refresh, both lessons, Rapid purchase/training, an upgraded roster with an empty
slot, and a seeded formerly identified browser. All 35 observed packets were
unidentified, with no identity/person updates, URLs, map/move events, or Meta,
replay and survey requests. These checks prove outbound payloads, not dashboard
ingestion. No controlled before/after performance comparison or physical-device
performance acceptance was performed for this analytics change.


Live acceptance: application commit `cbda5437d46b11e30ea92f1a3068646556413a6f`
was deployed with the Firebase CLI (Hosting, rules and indexes).
[CI run 40424265767](https://github.com/rohittp0/patrol/actions/runs/40424265767)
passed validation and deployment. All 16 anonymous-funnel checks passed at
`https://patrol.rohittp.com/`, observing 35 intercepted packets. Blocking analytics
requests also left the live tutorial and gameplay start usable without page errors.

A desktop Chromium sample using a 390×844 viewport and real Firebase saves
recorded app readiness at 4,757.9 ms cold / 1,072.4 ms after refresh. A one-second
idle Academy sample, taken before installing the test clock, recorded median/p95
frame intervals of 16.70/16.73 ms, browser task CPU 31.9 ms and JS heap 38.1 MiB.
Analytics uploads were intercepted. This is a representative smoke measurement,
not a matched baseline comparison, gameplay frame benchmark or physical-phone result.


## Signed-in account event properties (2026-10-27)

The owner subsequently requested email/name as event properties. Current funnel
and custom timing events now snapshot `signed_in`, and, for signed-in accounts,
`email`, `name`, `email_verified` and `auth_provider` from Firebase Auth. Names
fall back to the linked provider when the primary Firebase profile has no name.
Guest events omit personal fields; sign-out/account switches read the current
Auth user rather than retaining earlier properties. Queued events/timings keep
their original account snapshot. `app_open` waits for the existing Auth restore
so returning signed-in users have their details on entry.

Person processing/identify, replay, Meta and noisy events remain disabled. Events
with email/name are now personal data despite PostHog's personless flags. UIDs,
credentials, photos and attempt IDs remain excluded. The current contract is in
`docs/telemetry.md`; the earlier anonymous release above describes its historical
behavior, not the current signed-in properties.

Validation: 128 unit tests passed; all nine focused telemetry/account checks and
the production build passed after the linked-name fallback. Ten real-browser
checks with Firebase Auth/Firestore emulators intercepted 12 actual SDK packets,
covering guest entry, linked account fields, provider/verification values, queued
event/timing snapshots, sign-out, another account and refresh restoration. No
fixture account details were uploaded to PostHog. Full personal Google login and
dashboard ingestion were not automated. The entry bundle changed from 128.71 KB
to 128.99 KB gzip (+0.28 KB); matched runtime performance and physical-device
checks were not repeated for this event-property addition.


Release `bb40d6e9f6d946eb755f03618e67d341a2ece7b2` was pushed and deployed
with the Firebase CLI (Hosting, rules and indexes). The main JavaScript served
from `https://patrol.rohittp.com/` matched the verified local build byte-for-byte
(399,450 bytes) and contained the account-property mapping.
[Release CI](https://github.com/rohittp0/patrol/actions/runs/40470126507) passed
validation and deployment.


## Meta Pixel and session replay restored (2026-10-27)

At the owner's request, Meta Pixel and PostHog replay are enabled again. Meta
initializes independently and sends PageView plus the current level/result,
lesson, recruitment and training milestones. Its smaller allow-list excludes
account and save identifiers. PostHog retains signed-in event properties,
personless processing and the low-volume gameplay funnel.

Replay extensions load, all inputs remain masked and the existing uploaded
photo/crop/newspaper exclusions remain. The event filter now preserves structured
`$snapshot` payloads. The project's public configuration enables recording with
its existing `app_open` trigger and canvas settings. Since that entry event can
precede lazy recorder listeners, SDK initialization waits for recorder readiness
before flushing queued analytics, bounded to 8 seconds with 100 ms polls. Gameplay
and Meta continue immediately; blocked replay cannot prevent event delivery.
Project trigger/sampling settings are retained, with no forced recording override.

Validation: 129 unit tests passed; the final 13 telemetry/account/Meta checks
and production build passed. Twelve real-browser checks used the real Meta SDK,
recorder extension and public project configuration with uploads intercepted.
Three non-empty replay packets retained their session/window metadata. Meta sent
one PageView conversion and one each of GameStart, GameCompleted, GameWon and
field TutorialCompleted. Attribution-registration requests were counted separately
from conversions. No noisy map/move events returned. Normal development made no
provider requests, and blocking both providers left tutorial gameplay usable.
These are outbound-payload checks, not dashboard-ingestion acceptance.

One paired desktop Chromium touch-emulation sample (390×844, Vite/local save,
real SDKs/config with uploads intercepted) compared providers off/on. Preview
interaction was 66/74 ms, the first move 1,188/1,190 ms, median frame interval
16.7/16.7 ms, p95 16.7/16.8 ms, browser task CPU 218.7/303.7 ms and ending heap
33.5/38.6 MiB. Cold readiness was 141.8/126.4 ms and warm readiness 106.0/90.5 ms;
these single-load differences do not establish a startup improvement. The entry
bundle grew from 128.99 to 129.71 KB gzip; replay loads an additional extension.
Physical-phone replay appearance, frame cost and dashboard playback remain unverified.


Live release acceptance: `0a0d6ac3d91b4729a4ed3a11de739d54ec132136` was
pushed and deployed with the Firebase CLI (Hosting, rules and indexes).
[CI run 40473553445](https://github.com/rohittp0/patrol/actions/runs/40473553445)
passed validation and deployment. The deployed game passed all 11 provider checks,
with four non-empty intercepted replay packets, one GameStart, one GameCompleted,
one GameWon and one field TutorialCompleted. The live Meta SDK also emitted
PageViews around screen transitions; PageViews are not counted as game attempts.
Blocking both providers still left the tutorial playable. All browser contexts
were closed after acceptance.
