# Prototype verification — 2026-10-14

## Free hints, tutorial, and phone gate

- `npm test`: 36 tests passed. Hints replay a shortest winning continuation at
  every step of all twelve challenges without mutating the real game. Different
  openings in India and Hungary receive newly calculated one- and two-order
  solutions. Tests cover detached worker snapshots, active/ended-game rejection,
  and honest reporting when a search budget is exhausted.
- Desktop browser checks completed all five tutorial slides and loaded every
  GIF. Back/Next, completion persistence, and How to play restarting at slide
  one passed. Opening the tutorial during an order froze the simulation.
- Free hints highlighted the correct post and squad at each step. Following
  them won India with six points and Hungary with five. Showing hints repeatedly
  left orders and actor state unchanged. A different opening produced a fresh
  solution, and restarting during a search prevented stale results appearing.
- Phone checks at 390 × 844 and 844 × 390 confirmed a non-dismissible laptop
  message, hidden tutorial, inert game, blocked keyboard input, and no premature
  tutorial-completion record. The message fits landscape without scrolling.
  Resizing an active desktop game into the gate paused it and enlarging resumed
  it. An 820-pixel tablet was allowed; reduced-motion mode loaded PNG posters.
- `npm run build` passed. The production site loaded all five GIFs and both
  bundled workers with HTTP 200. Free-hint wins in both countries and the
  landscape phone gate passed with no page errors; the debug global was absent.
- Original tutorial GIFs total approximately 400 KB. Identical held frames are
  coalesced; each animation still lasts six seconds. Search time, simulation
  limits, tutorial version/timing, and device thresholds live in the central
  playtest configuration. Bounded hints distinguish proven shortest wins,
  verified recommendations, and survival advice without claiming an incomplete
  search proves impossibility.
- The development preview was restored at `http://localhost:3000/patrol/`.

## Difficulty progression and runner travel floor

- `npm test`: 29 tests passed. All six India challenges have an exact two-order
  minimum and all six Hungary challenges have an exact three-order minimum;
  every shorter legal sequence is exhausted by the validation search.
- Every difficulty score is nondecreasing across the twelve-challenge campaign.
  Starts are ordered rather than randomly selected. India accepts escape
  pressure up to 0.10; Hungary accepts 0.12–0.35. Recorded opening-choice metrics
  explicitly probe nearby orders rather than claiming exhaustive opening counts.
- The runner floor is 4% of the square root of projected playable land area:
  71.454 km for India and 12.200 km for Hungary. Tests cover short transfers,
  early post security, escape after arrival, early containment, frozen thinking
  time, isolated search branches, and frame-independent arrival events.
- A real short-hop browser check measured 71.454 km travelled and approximately
  71.308 km of net displacement. The destination was already secured, the moving
  squad icon was removed, and further orders stayed disabled while the runner
  finished its travel. The progress indicator showed this runner phase.
- Browser checks followed IN-001 through IN-006, then HU-001 through HU-006.
  Winning IN-001 advanced to IN-002; winning the final India challenge advanced
  to HU-001. Hungary's verified three-order win scored five. The final challenge
  offered an explicit campaign restart, which returned to IN-001.
- `npm run build` passed. The built site passed both countries' win flows,
  within-country progression, country transition, and mobile layout. Its map
  worker returned HTTP 200, 59 successful tile responses were observed, and
  there were no page errors. Existing remote-style label warnings remain.
- The development server was restored at `http://localhost:3000/patrol/`.

## Updated controls, boards, and runner

- `npm test`: 21 tests passed. All twelve regenerated setups have successful
  two- or three-order witnesses, and every legal first order is checked to
  reject one-order wins. Already-contained starts are rejected too.
- India now has 57 internal borders and three squads; Hungary has 36 internal
  borders and four squads. Both full-open navigation graphs remain connected.
- New runner spawn minimums were checked against authoritative polylines.
  Measured minima across India's pool: 52.1 km from the zone edge, 1551.7 km
  from land exits, and 24.8 km from internal borders. Hungary: 30.9 km from the
  zone edge/land exits and 6.7 km from internal borders.
- The runner anticipates squad arrival deadlines. Tests confirm it takes an
  alternative exit when needed and still uses a closing border when it can
  cross in time. Predicted closure does not count as actual containment.
- Curved squad routes are checked against land, including inlets and holes.
  Tests cover land safety and frame-independent movement on actual boards.
- Browser checks passed at 1280 × 720 and 390 × 844: post-first selection,
  highlighted border, paused thinking time, squad-post ring and automatic pan,
  Focus runner, moderate starting zoom, counters on the side, and removal of
  the inactive prompt. Secured borders use bright colours and a glow; open
  borders use muted colours. Both countries' win flows passed.
- Country view was checked to contain the entire zone after actor focus.
  MapLibre's `absolutePadding` option prevents accumulating HUD padding.
  Mobile controls adapt to the squad dock height, including its second row.
- `npm run build` passed. The built site passed both country win flows, runner
  escape, retry, and mobile rendering. Its map worker returned HTTP 200, 80
  successful vector-tile responses were observed, and there were no page errors.
  The development-only debug global was absent. The remote style still emitted
  label-expression warnings; some zooms also lack road-shield sprites.
- The development server was restored at `http://localhost:3000/patrol/`.

## Initial prototype checks

Local verification completed after the map, movement, playback, and HUD fixes:

- `npm test`: 14 tests passed, including all twelve stored winning setups.
- `npm run build`: TypeScript and the production build passed. Vite reports a
  bundle-size warning for the MapLibre-containing application chunk.
- Browser checks at 1280 × 720 and 390 × 844: real basemap and border overlays
  rendered, with post centres within one CSS pixel of projected coordinates.
- Thinking time remained paused; both actors changed position during an order,
  and the travelling squad marker remained visible. Departure opened the origin
  without securing the destination early.
- Two sampled long orders completed in 6.085 and 6.067 seconds including browser
  interaction overhead. Their simulated durations were 6.71 and 25.24 hours.
- India win, score, progression to Hungary, fresh setup, and restart were checked.
- The built site was served with `npm run preview` at the allowed local origin.
  Both countries' win screens, a runner escape, and retry passed. The bundled
  map worker returned HTTP 200, 59 successful vector-tile responses were observed,
  and there were no page errors. The development-only debug global was absent.
- The remote style emitted label-expression fallback warnings; these did not
  prevent rendering. Screenshots were inspected under ignored `output/playwright/`.

The development server was restored at `http://localhost:3000/patrol/` after
checking the production build. No GitHub remote or public deployment was created.

Two rendering regressions were fixed: Vite needed an explicitly bundled MapLibre
worker URL, and post-state updates must preserve MapLibre's positioning classes.
Playback now advances at least ten times faster than the initial prototype;
long journeys use a six-second cap while preserving both actors' relative
simulation speeds and distances. The initial camera adds clearance for the HUD.

## 2026-10-15 — per-hunt difficulty, squad counts, and refresh recovery

- `npm test`: all 72 tests passed. Every country has two exactly two-move
  introductions and four later hunts with an exhaustive rejection of all
  one- and two-move wins. All eighteen winning sequences replay successfully.
  Each country starts its six hunts in six distinct administrative regions.
- Existing verified three-squad India setups were retained. India's hunt
  allocations are now 3, 3, 4, 3, 4, 4; USA and Hungary use four throughout.
  Runtime rules, proof signatures, worker hints, saved games and newspaper
  reports use the individual hunt's allocation. Unsupported counts are rejected.
- Later hunts begin with at most one third of the actual final enclosure
  guarded, and meet the configured country-scaled squad travel floor. Three-
  and four-move witnesses are separate from the proved three-move lower bound.
  Hungary's final four-move witness does not claim an exact four-move minimum.
- Browser checks followed India's first two introductions and third hunt with
  free hints. The third remained playing after two moves and won on the third.
  Reload during movement preserved hunt, allocation, moves and attempt ID for
  both three- and four-squad hunts. Squad cards matched the actual allocation.
- Previous hunt replayed a four-squad hunt from a three-squad hunt, resetting
  the chase correctly. From Hungary's opening it returned to India's final
  hunt; reload retained that country and hunt. Earlier browser checks verified
  it is disabled at campaign start and replay preserves best scores. These
  functional checks produced no page errors; the existing style warning remains.
- `npm run build` passed; the existing MapLibre bundle-size advisory remains.
  Preparation publishes complete pools atomically and supports checkpoint resume.
- A desktop Chromium warm comparison used the same first move of IN-006 with
  saving enabled, then temporarily disabled. Both recorded 150 frames, median
  and p95 frame intervals of 16.7 ms, and a maximum of 16.8 ms. Five save calls
  had p95 0.2 ms and maximum 0.3 ms, storing 2,648 bytes. Browser task CPU was
  163.7 ms / 2,518.6 ms wall time with saving and 154.5 ms / 2,520.7 ms without.
  Used heap ranged 30.9–32.4 MiB across the samples; GC affected the deltas.
  This is a single warm comparison, not a cold-start, retained-memory or device
  benchmark. Instrumentation was removed by reloading the app.
- Development preview remains at `http://localhost:3000/patrol/`.
