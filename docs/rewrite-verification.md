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
