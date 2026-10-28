# USA campaign expansion verification — 2026-10-29

The campaign now runs India 1–15, then USA 16–25. The fourth slot is a one-time
250-coin purchase available at Level 15; the fifth remains deferred.

## Simulation and persistence

- All 15 original India level fields and first three posts were compared with
  `bd252b6`: unchanged. Optional fourth posts and explicit country IDs were added.
- Ten distinct USA spawns have replayed 3–7-move winning witnesses using fully
  trained Marksman, Rapid Action, Helicopter and one Patrol Squad. Speeds rise
  from 120 to 156 simulated km/h. All basic-team same-route comparisons fail;
  one-rank-lower specialists fail nine of ten. These are route comparisons,
  not exhaustive proofs that a weaker roster cannot win by another route.
- Minimum India rewards cover all specialist purchases, all existing upgrades,
  and the fourth slot. No reward, upgrade price or training timer was changed.
- Unit coverage includes slot gating, insufficient coins, duplicate purchases,
  empty rosters, legacy Level 15 advancement without payout, preservation of old
  active attempts and training, correct country replay and all ten USA rewards.
- Firebase emulator coverage includes private ownership, legacy three-slot saves,
  four-slot USA start/checkpoint/reload/finish and duplicate payout prevention,
  invalid fifth slots, invalid country/level combinations and stale revisions.

## Browser checks

Desktop Chromium with mobile viewport emulation, using development-only local
fixtures, confirmed:

- Fresh players see India; Level 25's locked USA case can be inspected.
- An existing Level 15 winner lands on USA Level 16 automatically, preserving
  the wallet and collection. Fourth-slot purchase deducts 250 once and pads the
  saved roster with an empty slot.
- Four selected squads start on the USA board and survive refresh.
- Level 16 wins through ordinary squad/post selection and Deploy controls,
  credits the shown 510-coin reward, then unlocks Level 17.
- Level 25 resumes after three completed moves, wins in seven, credits 390,
  and offers Campaign Complete and Home, with no Level 26 or fifth slot.
- Four-squad layouts fit 390×844, 320×740 and 844×390 without horizontal overflow.
  Tactical borders, basemap detail and visible provider attribution were checked
  after map loading settled. Browser tabs were closed after checks.
- USA events retain global level numbers. Meta's first-specialist conversion is
  unchanged; fourth-slot purchase has a separate PostHog event and does not
  trigger FirstSquadPurchased. Successful USA levels retain GameWon.

Screenshots are local, ignored artifacts under `output/playwright/usa-*`.

## Representative performance evidence

Matched fresh Chromium contexts, 390×844, local Vite servers and local saves;
old source `bd252b6` versus this change. Cold disables browser cache; warm reloads
with cache enabled. One sample each; these are desktop observations, not mobile
hardware or production Firebase latency measurements.

| Path | Before ready | After ready | Before CPU task time | After CPU task time | Before JS heap | After JS heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cold home | 119.5 ms | 79.1 ms | 91.2 ms | 61.7 ms | 13.2 MiB | 7.1 MiB |
| Warm home | 51.0 ms | 37.3 ms | 47.4 ms | 33.3 ms | 26.5 MiB | 9.5 MiB |

Before home downloaded the 1,728,419-byte India board. After home downloads
neither country board; roster entry preloads only its country. The unconditional
India HTML preload was removed so a USA resume does not download India too.
The ten new 512px WebP portraits total 461,354 bytes and case-grid images load
lazily.

A USA Level 16 browser win sampled 526 animation frames: median 8.3 ms, p95 9.2 ms
(about 120 Hz median); total main-thread task time across the three moves and
capture was 1,355.7 ms, ending JS heap 33.6 MiB. The playback engine and its
per-frame logic were unchanged. Physical-device FPS, thermal behavior and CPU
profiling remain unverified; player difficulty balance needs live play evidence.
