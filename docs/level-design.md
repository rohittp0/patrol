# Level geometry and validation

## Agreed rewrite scope

The progression rewrite begins in India for every player, regardless of their
country or timezone. India contains Levels 1–15 and USA follows at Levels 16–25.
Other countries remain future sequential progression. The India level
design and difficulty progression require a complete redesign and rebalance for
the new squad collection, upgrades, rewards, and 15-move budget; existing setups
and their proofs do not establish balance or correctness under the new rules.

India must contain at least 15 consecutive levels with increasing difficulty.
Without the suitable squad upgrade, a level should require more moves and may
eventually be impossible within the 15-move budget. Later levels must therefore
make upgrades necessary, rather than merely improving rewards. Initial squad
purchases must be cheap to make the first specialist accessible early, with
Rapid Action Squad available at Level 3. The campaign needs an achievable earning
and spending path through its required upgrades; replay rewards remain limited
to the positive improvement over the reward already earned for a level.

Training is allowed even when fewer than three squads remain available. Players
may start levels with empty deployment slots. Cheap early purchases are the
agreed approach to accessibility; resale or refund mechanics are not agreed.

The remaining sections describe the existing prototype and its validation, not
the completed rewrite.

## Existing prototype

The prototype compiles three country boards from pinned Natural Earth data.
Mainland USA has 126 guardable borders (109 internal), India has 79 (57 internal),
and Hungary has 50 (36 internal).
Each country has six starting
setups whose winning sequences replay successfully through the browser engine.
These establish playability; country ordering and puzzle difficulty still need
playtesting.

## Boundary data

Use Natural Earth's 1:10 million country boundaries, coastlines, and first-order
administrative boundaries as the initial source family. Its administrative data
includes states and provinces, and its documentation describes these themes as
matching the country and coastline themes. The data is public domain.

- [Countries and administrative boundaries](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/)
- [State and province boundaries](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/)
- [Terms of use](https://www.naturalearthdata.com/about/terms-of-use/)

Use real boundary segments to author a readable subset for each country. Where
state/province data is insufficient, investigate finer administrative data from
[geoBoundaries gbOpen](https://www.geoboundaries.org/api.html), preserving its
source metadata and attribution. Natural Earth's county layer covers the United
States, so it is insufficient for that fallback. The currently inspected
geoBoundaries [India](https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/)
and [Hungary](https://www.geoboundaries.org/api/current/gbOpen/HUN/ADM1/) ADM1
metadata represents 2011 boundaries, so it must not be described as current
administrative geography without further verification.

The compiler pins Natural Earth repository revision
`ca96624a56bd078437bca8184e78163e5039ad19`. Each generated board records source
URLs, SHA-256 checksums, and byte sizes. It uses the state/province polygons and
national land-boundary lines; coastlines are the remaining outer land edges.
The compiler lives in `scripts/prepare_maps.py` and takes all numeric geometry
tolerances from the central TypeScript configuration.

## One authoritative game geometry

The owner-controlled MapTiler style supplies the visual basemap. Compile the
gameplay geometry separately and use the same processed coordinates for visible
game borders, movement barriers, and containment checks. Compare the overlays
with the basemap during visual validation; matching source families do not imply
an exact match with MapTiler's geography.

A country board includes its playable land, coastline, outer land exits, authored
border segments, and border posts. Detached islands are excluded. A future
multi-country zone uses the combined playable land; shared national boundaries
are internal and do not count as exits.

Split border lines at valid junctions and maintain shared endpoint coordinates.
Every authored segment is non-closed and ends at another border, coastline, or
the zone's outer boundary. A segment's length follows its path; its post sits at
half that accumulated length. Apply length limits from the central tuning file.
Internal lines retain their actual junctions. Long outer land boundaries may
be split into guardable stretches whose endpoints lie on the zone boundary.
Short source fragments remain part of the navigation and escape geometry but
do not receive posts outside the configured length range.

Each post holds at most one squad. Borders retain their assigned identity colour
when changing between open and secured states. The full outer land boundary
remains an escape boundary, including portions not chosen as squad destinations.

## Movement and containment

The compiler polygonizes the shared border network and triangulates its land
faces. Triangle centres, shared-edge portals, border posts, and land exits form
an undirected graph. The graph proves connectivity and supplies candidate routes;
it does not dictate a zigzag through every triangle centre. From its actual
position, the fugitive seeds visible land nodes and border crossings, then pulls
each route taut inside its polygonized land face. Every border and outer-exit
checkpoint is retained. Visibility checks include water holes and never shortcut
across an administrative boundary. A face anchor tracks which side the fugitive
occupies after crossing, including when an order ends between graph nodes.
The fugitive follows this shortened path at its configured constant speed.
These bounded candidate routes approximate free land movement; they are not
claimed to be exact continuous geodesic shortest paths.
Squad routes are pulled taut through visible land and rounded into sampled
quadratic curves. Every candidate curve segment is checked against the playable
polygon, including holes; unsafe curvature is reduced or falls back to the land
route. The simulation and visible squad marker follow the same curved path at
a constant distance per simulated hour. Its measured length determines order
duration, so setup verification includes this route processing.
The same compiled borders classify visible lines and blocked runner portals.
Squads can cross secured borders; those barriers restrict the runner.

Route selection is separate from movement. During an order, the runner searches
for an escape route whose crossings of the destination border occur
before the squad arrives. Deadlines use distance along the shortened route to
the crossing, not the full journey to an exit. The destination stays unguarded
until arrival: a fugitive that beats the squad can cross and continue escaping
after the squad arrives. Virtual start nodes reached from a mid-path position
have the same deadline checks as later crossings. It can take an alternative exit instead of running
into a predictable closure. If no such route exists, it still attempts the
shortest currently open escape route; anticipated closure alone never declares
a win. Choices are deterministic and recalculated when borders open or close.

Containment means the runner's reachable land component has no route to an open
outer land exit. This implements the closed-enclosure rule without estimating
an enclosure from rendered pixels. Ocean completes the enclosure naturally.

An order lasts the greater of squad travel time and the time needed for the
runner’s country-scaled minimum travel. The floor is `0.04 × sqrt(projected
playable land area in km²)`, currently 71.45 km for India and 12.20 km for Hungary.
Both simulated speeds remain constant. The origin opens on departure and the
destination secures at actual squad arrival, even if the runner still has travel
remaining. Arrival is a separate simulation event; border changes are applied
before remaining time advances, independent of animation frame size. Escape or
containment ends the order immediately. Between resolved orders, time is paused.

## Verified starting setups

`scripts/prepare-setups.ts` keeps six verified hunts per country, each starting
in a different state or province. Every country begins with two hunts whose
minimum solution is exactly two moves. The remaining four prove that no one- or
two-move win exists, and store a successful three- or four-move route. The proven
lower bound and the known solution length are separate fields; a four-move
witness is not an exact four-move minimum claim.

Search considers individual regions and connected groups of up to three regions.
It prioritizes known hunt areas and land exits, samples cleared land nodes and
nearby posts, and tests promising transfers first. Spawns in neighboring regions
allow a fugitive to run into the final enclosure. Necessary repositioning moves
can precede or interrupt closure of the final borders. Candidate search is
bounded; failure to find a setup is not an impossibility proof.

Later hunts begin with at most one third of the final enclosure guarded (one
border in a three- or four-border trap). Their mean squad journey must meet the
configured fraction of square-root country land area. These checks use the
actual capture component and actual travelled routes, not the target enclosure
the generator hoped to form.

Squad allocations belong to individual hunts. Each country configures supported
`squadCounts` in preparation preference order. New searches prefer the first
count large enough for the target enclosure; existing verified setups retain
their own supported allocation. Runtime validation, hints, saved games and
newspaper facts all use that hunt's actual count. Each allocation has a separate
rules signature, so proofs for three squads cannot validate a four-squad hunt.

Every accepted candidate replays its complete witness and exhausts all legal
sequences shorter than its required lower bound. Static reachability only prunes
branches whose final guarded borders cannot enclose any land; it ignores runner
position and timing conservatively. A tiny-board regression compares this
pruning with entirely unpruned two-move simulation. Immutable geography and
bounded navigation caches are shared by independent simulation forks.

Verified candidates are checkpointed under ignored `scripts/.cache/`. Resume
with `npm run prepare:setups -- --resume [country]`. Saved candidates remain
suggestions even after tuning changes; their witnesses, allocation, placement
and shorter-solution proofs are rebuilt before acceptance. Only a complete pool with two introductory
and four later hunts is published. Publication uses an atomic file replacement.

Static enclosure checks alone do not prove a setup is winnable: travel time and
the temporary opening at the departing post can let the runner escape. Reject
setups that already start won or lost, place squads at distinct valid posts, and
place the runner on playable land away from boundary ambiguity. Minimum spawn
distances are checked against the authoritative polylines: India requires 25 km
from any zone edge, 75 km from land exits, and 15 km from internal borders; Hungary
requires 30 km from the zone edge/land exits and 6 km from internal borders.
These playtest values live in the central configuration.

`npm run prepare:setups -- --revalidate [country]` replays existing witnesses,
exhausts shorter solutions, remeasures difficulty, and refreshes signatures. It
refuses to publish if any entry fails. Use the normal preparation command to
search for replacement setups when a witness is no longer valid.

Revalidate the pool when relevant geometry, squad allocations, order budgets,
speeds, runner behaviour, or simulation rules change. A future generator can
publish new setups only after successfully replaying a winning sequence; failure
to find a sequence does not prove a candidate is impossible.

## Current campaign expansion

Global levels run from 1 to 25: India 1–15, then USA 16–25. The collection,
wallet, training deadlines and selected roster carry forward. A fourth deployment
slot is purchasable at Level 15 for 250 game coins; the fifth remains deferred.
USA uses the existing contiguous mainland board with ten new distinct spawns,
case illustrations and replayed winning routes. Runner speed increases from
120 to 156 simulated km/h. USA witnesses use fully trained specialists and a
fourth Patrol Squad; they take 3–7 moves within the common 15-move budget.

All ten basic-roster same-route comparisons fail; lowering each specialist one
upgrade fails nine of ten witnesses. These comparisons show the effect of squads
and training on those routes, not that all alternate weaker-roster routes fail.
Starter balance still needs player evidence. India positions and original
three-slot witnesses are preserved. Existing completed Level 15 saves advance to
16 once without a new payout; old active attempts retain their original setup.

`npm run prepare:usa` rebuilds USA and adds optional fourth India starting posts
without regenerating the original India levels. `npm run prepare:campaign`
regenerates both chapters. Hashes and winning routes are checked by the game tests.

## Legacy board-pool progression and presentation

The following describes the retained prototype board pools, not the shipped
25-level campaign. Their geometry and original setup tests remain useful.

The authored default order is USA, India, then Hungary. A new player's supported
home country moves to the front based on device timezone; unmatched timezones
use USA. The other countries retain their relative order. Examples are
India → USA → Hungary and Hungary → USA → India. The remembered sequence drives
the country selector, hunt numbers, Previous/Next hunt, newspaper issue number
and opening guided hunt. Returning players resume their chase; legacy saves
without an order marker retain the original authored sequence. Timezone matching
is configured separately from simulation tuning and does not invalidate proofs.

There is no strict worldwide difficulty ladder. All countries allow eight moves
and use the same two introductory/two-move and four later/at-least-three-move tiers.
Country-specific geography, squad allocations and escape-pressure bands can
still affect perceived difficulty. These similarities support a local opening
country; they are not proof of equal player success rates. The six-hunt
progression restarts in each country: two introductions, then four harder hunts.
Tests enforce six distinct spawn regions, the per-hunt move floor, successful
witnesses, physical placement constraints, and increasing scores within each
country. A deliberate introductory reset replaces the old requirement for one
nondecreasing score across the entire world campaign.

Difficulty combines the proven move floor, any extra moves in the verified
solution, country-scaled mean squad travel, the unguarded share of the final trap,
and escape pressure. All weights and thresholds live in `playtest.config.ts`.
Escape pressure is minimum runner travel divided by initial land escape-route
length. These metrics help curate hunts; they do not predict every player's
experience. The old sampled opening-breadth constraints no longer govern curation.

Proofs carry a SHA-256 signature of geometry, movement, runner policy, per-hunt
tiers and country curation. Runtime rejects stale proofs. Saved gameplay also
checks the exact starting setup, so new generated hunts cannot inherit actors
or clocks from an unrelated older setup.

Start moderately zoomed around the runner, using a configured 350 km radius
for India, 400 km for USA, and 100 km for Hungary. Country view fits the whole zone; Find fugitive
centres the runner more closely. Selecting a squad highlights its post and pans
only if its position is outside the useful viewport. Validate camera fit and
legibility on representative screen sizes. Keep all new numeric tolerances and tuning values in
`src/game/playtest.config.ts`.

USA retains its extra curation: at least four internal borders at each spawn
and four guarded borders in the final enclosure. Tests check that releasing any
one squad reopens escape. Its six starting states are distinct, as are India's
states and Hungary's counties. Country-scale differences are handled by travel
fractions and spawn clearances rather than fixed travel distances.

Exact enclosure connectivity is contracted for pruning: unguardable components
become vertices and equivalent guardable portals share vertices. Movement uses
the full distance graph and land-face visibility. Tests compare contraction with
full graph reachability on every board.

## Refresh recovery and replay

`patrol:progress:v1` stores the current country/hunt, a simulation snapshot,
selection, attempt ID and elapsed active-session time. It saves on state changes,
once per configured interval during movement, and on visibility/page-exit events.
It does not write localStorage every frame. Thinking remains paused, and time
spent off the page does not advance either actor.

JSON restoration reconnects each actor segment to its route's first waypoint and
the active order to its history entry before resuming. Validation checks board
indices, clocks, outcomes, rules signatures and setup identity. Damaged or stale
snapshots restart the same hunt safely. A restored completed result retains its
attempt's ended flag, avoiding duplicate completion events.

Previous hunt is disabled at the first campaign hunt and while moving. It starts
the preceding hunt afresh, including across country boundaries. The result screen
advances after capture; best scores remain independent of replay navigation.

## Prototype scope

USA uses the contiguous mainland: Alaska, Hawaii, and detached islands are
excluded. Washington DC joins its host; state lines remain internal borders.
Pinned Natural Earth lake polygons of at least 500 km² are removed before graph
construction, so the Great Lakes cannot become land shortcuts. This creates
additional land faces without treating a lake as a country exit. The current
fugitive travel floor is 113.38 km for this board.

India preserves mainland state boundaries instead of merging the interior into
one large region. Enclaved union territories (Delhi, Chandigarh, Puducherry,
and Dadra and Nagar Haveli and Daman and Diu) join their nearest host state to
avoid closed individual border loops. Hungary retains nineteen county regions;
Budapest and other municipalities join their host county. Detached islands are
excluded. These are authored level choices, not a complete reproduction of
every administrative subdivision. Hungary has four squads rather than three
to provide enclosure options in the denser, landlocked network.

Geometry is generalized with the configured 1.5 km tolerance and uses a local
projected space for topology. Geographic edge lengths use haversine distances.
Small source fragments and triangulation can affect routes near narrow features;
future boards can use finer data and navigation while retaining the same engine
interface. The source geometry and basemap may not coincide exactly.

The current checks validate connected full-open navigation, non-closed borders
within configured lengths, and winning setup replays. Browser checks should also
verify real map loading, marker alignment, visible squad and runner movement,
idle pause, result flows, camera clearance, and mobile controls.
