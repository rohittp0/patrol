# Patrol

A single-player map game: relocate squads to close an enclosure around a runner
before it escapes the patrol zone by land. The first playable prototype includes
India and Hungary, each with six verified challenges. The campaign starts at
India’s easiest challenge and progresses through all twelve in difficulty order.

## Play locally

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000/patrol/**. The port is fixed because the map style
allows this browser origin. Select a white border post to highlight its border,
then choose the squad to send there. Clicking a squad without a selected open
post brings it into view without issuing an order. Number keys choose squads;
Escape clears the selected post. Games start moderately zoomed around the
runner. Country view fits the entire zone, and Focus runner centres and zooms to the runner. The selected squad’s
post receives a bright ring; the counters sit on the right side of the map.

First-time visitors see a five-slide mission briefing with original animated GIFs.
**How to play** always restarts that tutorial from slide one. Completing or
skipping it is remembered locally; reduced-motion visitors see static posters.
Opening the tutorial pauses an in-progress order. Phones show a non-dismissible
message asking the player to open Patrol on a laptop or desktop, including in
landscape. Narrow desktop windows show the same message until enlarged.

**Show hint** is free and highlights a destination post and squad without spending
orders, points, or game time. Click the suggested squad to issue the order.
Advice is recalculated from the exact current state, including after a different
opening. Every claimed winning continuation is checked in the game simulation.
“Best move” means a shortest win has been proved. A bounded search can instead
show a verified winning recommendation without claiming optimality, or a
survival suggestion that leaves the longest escape route among checked moves.
It does not label an incomplete search as an unwinnable position. Searches run
in a cancellable web worker; hints clear when the game state changes.

Thinking time is paused. During an order, the old border opens immediately,
both actors travel, and the new border becomes secured on arrival. The runner
has a minimum travel distance per order, scaled to the square root of the
country’s playable land area: currently about 71 km in India and 12 km in Hungary.
After a short transfer, the squad secures its post while the runner finishes
that travel. Escape or containment ends the order immediately; longer transfers
can allow more runner travel. Both actors keep their constant simulated speeds. Open borders
use muted colours; secured borders use bright colours and a glow. Squads move
at twice the runner's simulated speed. Playback is accelerated for playtesting:
100 km takes approximately one second, and long journeys take at most six
seconds of active playback. Acceleration applies equally to both actors and
does not change their relative travel distances or puzzle outcomes. Squad routes
remove triangle-centre zigzags and use land-checked arcs with rounded corners.
Their actual curved distance determines travel time and runner advancement.

Win by sealing every land escape route with secured borders and coastline.
Lose if the runner escapes or remains free after the final allowed order.
The score is the order budget minus orders used to win.

India has 57 internal borders and three squads. Hungary has 36 internal borders
and four squads. India’s challenges require exactly two orders to win; Hungary’s
require exactly three. Shorter solutions are exhaustively rejected. Within each
country, measured successful opening choices and escape pressure rank challenges
from easier to harder. India’s pressure band is lower than Hungary’s.

Wins advance to the next challenge, with Hungary following all six India
challenges. The header button explicitly skips a challenge; replay restarts the
same one. The final challenge offers an explicit campaign restart.

Both countries’ starts span at least two runner regions. An initially winnable
puzzle can still be lost through later
orders; setup verification proves a solution exists from the starting position.

## Tuning and validation

- [CONTEXT.md](CONTEXT.md) defines the game vocabulary and rules.
- [src/game/playtest.config.ts](src/game/playtest.config.ts) contains documented
  tuning values, including speeds, playback, squad counts, budgets, colours,
  map tolerances, the ordered country list, hint search limits, tutorial version,
  GIF dimensions/timing, and phone detection thresholds.
- [docs/level-design.md](docs/level-design.md) explains compiled geometry,
  navigation, source attribution, and prototype limitations.

```sh
npm test
npm run build
npm run preview
```

The runner anticipates the destination border closing and chooses the shortest
escape route it can still traverse in time, falling back to an escape attempt
when closure is unavoidable. It remains deterministic for setup verification.

The engine tests check order timing, escape, containment, scoring, frame
independence, connected navigation, border constraints, spawn clearance, and
every stored winning sequence. Searches exhaust every solution shorter than
the country’s required minimum, including two-order shortcuts in Hungary.
Difficulty metadata is bound to the exact geography, movement rules, and policy
with a SHA-256 signature. The browser checks this signature, pressure bands,
winning sequences, one-order shortcuts, and spawn clearance before play.
A tuning change that invalidates every setup produces an explicit
error instead of starting an unverified puzzle.

## Regenerate boards and setups

Generated JSON in `public/data/` is included in the repository. Normal development
and GitHub Pages builds do not require Python. To change the curated borders or
geometry tolerances, install `uv`, then run:

```sh
npm run prepare:maps
npm run prepare:setups
# Or regenerate just one country: npm run prepare:setups -- hungary
npm test
```

The map compiler downloads pinned Natural Earth data into ignored
`scripts/.cache/` and uses Shapely 2.2.0 through an isolated `uv` environment.
It records source URLs, revision, SHA-256 hashes, and byte sizes in each board.
Regenerate setups after changing geometry, simulated speed ratios, squad counts,
order budgets, runner travel floors, difficulty criteria, or runner rules. Playback speed and visual changes alone do not
alter the simulation outcomes.

The tutorial GIFs and static PNG posters are included under `public/tutorial/`.
They are original code-drawn illustrations, with no external artwork or map key.
To regenerate them after editing the animation settings or opening order budget,
install Pillow for Python 3 and run `npm run prepare:tutorial`. Ordinary builds
use the included assets and do not need Python.

## Stack and hosting

TypeScript, Vite, MapLibre GL JS, and HTML/CSS run entirely in the browser.
The build emits static assets in `dist/`, with `/patrol/` as their base path.
[.github/workflows/pages.yml](.github/workflows/pages.yml) tests and builds pull
requests, and deploys `main` through GitHub Pages. Enable GitHub Actions as the
repository's Pages source when connecting the repository. The intended public
URL is **https://rohittp.com/patrol/**.

The visual basemap loads directly from the owner-controlled style at
`https://dashboard.lascadian.com/maps/default.json`. Its embedded MapTiler key is
not copied into source. The style and dependent resources must allow
`http://localhost:3000` and `https://rohittp.com` as browser origins. If map detail
fails, a plain background still renders the separate authoritative game geometry.

The generated game boundaries come from public-domain Natural Earth data. They
are generalized source geometry and may differ slightly from the visual basemap;
they are not a statement of current administrative or political boundaries.
