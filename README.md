# Patrol

A single-player map game: move squads to surround a fugitive before they escape
the patrol zone by land. Eighteen historical case files span the USA, India, and
Hungary, with six verified hunts per country. The campaign starts in the mainland
USA and progresses through all eighteen in measured difficulty order. Each hunt
introduces a different fugitive; a capture reveals how the real manhunt ended.

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
fugitive. The selected squad’s
post receives a bright ring; the counters sit on the right side of the map.

New campaigns use the device timezone to choose a supported opening country:
India for `Asia/Kolkata` or `Asia/Calcutta`, Hungary for `Europe/Budapest`, and USA
everywhere else or when the timezone is unavailable. This is a device setting
heuristic, not a verified location or nationality; it needs no network lookup or
location prompt. The opening country comes first, followed by the other countries
in their authored relative order. The sequence is remembered in
`patrol:campaign:v1`, so travel does not rearrange a campaign. Existing saves from
before this feature retain USA → India → Hungary and resume their exact chase.
The country selector still lets players change patrol zone.

The first hunt in the chosen opening country teaches play on the real board. A spotlight and pointer highlight
the post to click, then the squad to send, for both moves of the verified capture.
Other actions are blocked until the prompted action or **Skip guidance**; skipping
immediately releases the current chase without resetting it. Refresh resumes the
correct prompt or in-progress move. Completion and skipping are remembered locally,
and later hunts run without guidance. Existing off-sequence saves are left alone.
After guidance is skipped or completed, **How to play** opens the optional
five-slide animated reference. It pauses an in-progress move until closed.
Reduced-motion visitors see static reference posters and a stationary pointer.
Phones, tablets, and desktop windows share the full game. On small screens,
Hint stays on the map; **More** contains Case file,
How to play, Restart, Previous hunt, and the best score. Select border posts
directly on the map; pan and pinch to explore. Pick a post, then a squad; the dock's **Clear selected post and
squad** control cancels a selection without spending a move. On mobile, selecting a post opens the squad picker at the bottom. Clearing the
selection closes it; an active move shows only the journey strip. Hint rests
near the bottom and moves above the picker while it is open.
The logo/country bar and +/− zoom buttons are hidden on phones, including
landscape; the large moves counter is centered at the top with More at the right. Use pinch gestures to zoom. Desktop and larger tablets retain country
selection and zoom buttons. Rotation and browser resizing preserve the current chase.

**Show hint** provides four recommendations per browser without spending moves,
points, or game time. The button shows the remaining count. Using the final hint
starts a 30-minute countdown on the button; all four refill when it ends. The count
and deadline persist across refresh, hunt changes, and browser tabs. Closing a
hint, cancelling a search, errors, and searches with no recommendation do not
spend another hint. Click the suggested squad to issue the order.
Advice is recalculated from the exact current state, including after a different
opening. Every claimed winning continuation is checked in the game simulation.
“Best move” means a shortest win has been proved. A bounded search can instead
show a verified winning recommendation without claiming optimality, or a
survival suggestion that leaves the longest escape route among checked moves.
It does not label an incomplete search as an unwinnable position. Searches run
in a cancellable web worker; hints clear when the game state changes.

Thinking time is paused. During an order, the old border opens immediately,
both actors travel, and the new border becomes guarded on arrival. The fugitive
has a minimum travel distance per order, scaled to the square root of the
country’s playable land area: currently about 113 km in USA, 71 km in India, and 12 km in Hungary.
After a short transfer, the squad guards its post while the fugitive finishes
that travel. Escape or containment ends the order immediately; longer transfers
can allow more fugitive travel. Both actors keep their constant simulated speeds. Open borders
use muted colours; guarded borders use bright colours and a glow. Squads move
at twice the fugitive's simulated speed. Playback is accelerated for playtesting:
100 km takes approximately one second, and long journeys take at most six
seconds of active playback. Acceleration applies equally to both actors and
does not change their relative travel distances or puzzle outcomes. Squad routes
remove triangle-centre zigzags and use land-checked arcs with rounded corners.
Their actual curved distance determines travel time and fugitive advancement.
The fugitive takes direct visible paths within each region, retains border
crossings, and avoids water. It races across a closing border when it can beat
the arriving squad; crossing time is measured along the route it actually runs.

Win by sealing every land escape route with guarded borders and coastline.
Lose if the fugitive escapes or remains free after the final allowed order.
The score is the move budget minus moves used to win.

USA has 109 internal borders, India has 57, and Hungary has 36. Squad counts
belong to each hunt: USA and Hungary currently use four; India supports both
three and four, keeping existing verified three-squad missions. Each country contains six hunts starting in six
different states or provinces. The first two have a verified two-move solution.
Every later hunt rejects all one- and two-move wins and has a replayed winning
route within the budget. Some verified routes take four moves; that alone does
not prove a three-move solution is impossible.

Later hunts start with at most one border of a three- or four-border final trap
already guarded. Squad travel has a country-scaled minimum, so closing the net
requires real deployment. Difficulty ranks hunts within each country, then
returns to the introductory tier when the next country begins.

The chase is saved in this browser, including the current hunt, moves, squads,
fugitive position, and a move in progress. Refresh resumes it. **Previous hunt**
replays the preceding hunt and is disabled at the campaign's first hunt; from a
country's opening hunt it returns to the previous country's last hunt. Wins
advance through the result screen's **Next hunt** button. Replay starts the
current hunt again. Best scores remain saved when replaying earlier hunts.

A lost position can result from later choices even when the starting setup is
winnable. Saved chases are tied to their exact setup and rules: after a changed
mission is released, Patrol keeps the hunt position and starts its updated chase.

## Case files and your front page

[src/game/case-files.ts](src/game/case-files.ts) assigns one historical case to
each hunt, including its introduction, real ending, source, and illustrated
portrait. These are imagined chases, not reenactments. Real endings distinguish
arrest, surrender, and death. [Portrait art notes](docs/portrait-art.md) document
the built-in image generation prompt set and saved assets.

Winning the second challenge of each country opens **You made the front page**
once per browser, remembered in `patrol:newspaper-intros:v1`. **Skip** (or Escape)
takes the player straight to the next hunt. Replays and later captures show the
ordinary result card with an optional **Make headlines** button. The opening
tutorial hunt also uses this ordinary card. Closing that
optional editor returns to the same result.

Add a name and photo, drag/zoom the circular head crop, and share or keep the
1200 × 1500 PNG clipping. Textured aged paper, uneven cut edges, fold marks,
blackletter type, a capture stamp and playful copy frame the actual capture
region, squads, moves and score. The sourced historical ending stays separate.
A newspaper-style **Squad leader wanted** notice prominently invites readers to
play at rohittp.com/patrol. The same fugitive illustration is used on the map and
newspaper; only the newspaper masks its edge-connected ivory background, leaving
the original assets intact. India uses its own khaki police uniform, cotton
kurta, Indian street scene and default officer; USA and Hungary share the
existing illustration. Artwork follows the capture report's country, with a
separate cache per preset. Artwork and masks are prepared only when opened,
then reused during editing. The phone editor stacks the clipping preview and personalization controls;
Close/Skip and Share/Download remain outside the scrolling content, including
when the keyboard opens. The desktop editor retains its two-column layout.
Native file sharing includes an invitation to https://rohittp.com/patrol; browsers
without file sharing download the PNG and offer invitation text to copy.

Only the finished 512-pixel circular crop, name, and random profile ID are saved
in `patrol:player:v1` in localStorage. Full uploads and crop coordinates stay in
memory while editing and are discarded on close. No image is uploaded. Removing
the photo clears the saved crop. Storage failure leaves export available.

## Analytics and performance

Meta Pixel `1412945137121409` records page views, hunt starts/resumes and outcomes,
captures, guided tutorial completion, and newspaper downloads/successful shares.
It follows the production/debug telemetry gate and sends no player profile data.
See [the telemetry contract](docs/telemetry.md#meta-pixel) for event definitions,
Meta's browser attribution behavior, and verification instructions.

PostHog covers the entry, tutorial, case introductions,
country loading, selections, moves, hints, outcomes, historical sources, and
newspaper creation/export/share journey. The central research contract is
[src/telemetry/events.ts](src/telemetry/events.ts): every event, allowed parameter,
user property, and custom timing event has a description and emitting module.
[Telemetry notes](docs/telemetry.md) explain live events, reporting, sampling, and
what stays local. There is no consent screen for this internal release.
The saved player name is attached through PostHog identity, and session replay is
enabled in the SDK; the project's Record user sessions setting must also be on.

## Tuning and validation

[Mobile web notes](docs/mobile-web.md) describe the responsive controls, browser
regression commands, review fixes, measurements, and device verification limits.

- [CONTEXT.md](CONTEXT.md) defines the game vocabulary and rules.
- [src/game/playtest.config.ts](src/game/playtest.config.ts) contains documented
  tuning values, including speeds, playback, squad counts, budgets, colours,
  map tolerances, the ordered country list, hint search limits, tutorial version,
  GIF dimensions/timing, and interface interaction/camera tuning.
- [docs/level-design.md](docs/level-design.md) explains compiled geometry,
  navigation, source attribution, and prototype limitations.

```sh
npm test
npm run build
npm run preview
```

The fugitive anticipates the destination border closing and chooses the shortest
escape route it can still traverse in time, falling back to an escape attempt
when closure is unavoidable. It remains deterministic for setup verification.

The engine tests check order timing, escape, containment, scoring, frame
independence, connected navigation, border constraints, spawn clearance, and
every stored winning sequence. Searches exhaust every solution shorter than
that hunt’s required minimum, including every two-move shortcut in later hunts.
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
# Continue from verified candidates after an interrupted search:
npm run prepare:setups -- --resume india
# Or regenerate just one country: npm run prepare:setups -- hungary
# Replay, remeasure, and re-sign existing setups without searching for replacements:
npm run prepare:setups -- --revalidate
npm test
```

The map compiler downloads pinned Natural Earth data into ignored
`scripts/.cache/` and uses Shapely 2.2.0 through an isolated `uv` environment.
It records source URLs, revision, SHA-256 hashes, and byte sizes in each board.
Regenerate setups after changing geometry, simulated speed ratios, squad counts,
move budgets, fugitive travel floors, difficulty criteria, or fugitive rules. Playback speed and visual changes alone do not
alter the simulation outcomes.

The tutorial GIFs and static PNG posters are included under `public/tutorial/`.
They are original code-drawn illustrations, with no external artwork or map key.
To regenerate them after editing the animation settings or opening move budget,
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
