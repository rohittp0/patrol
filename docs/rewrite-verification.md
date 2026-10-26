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
