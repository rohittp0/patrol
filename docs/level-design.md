# Level geometry and validation

The first prototype compiles two country boards from pinned Natural Earth data.
India has 79 guardable borders (57 internal) and Hungary has 50 (36 internal).
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
an undirected graph. Routes are shortest on this graph, an approximation of
free movement across land rather than exact continuous geodesic shortest paths.
The runner interpolates continuously along graph edges at its configured speed.
Squad routes are pulled taut through visible land and rounded into sampled
quadratic curves. Every candidate curve segment is checked against the playable
polygon, including holes; unsafe curvature is reduced or falls back to the land
route. The simulation and visible squad marker follow the same curved path at
a constant distance per simulated hour. Its measured length determines order
duration, so setup verification includes this route processing.
The same compiled borders classify visible lines and blocked runner portals.
Squads can cross secured borders; those barriers restrict the runner.

Route selection is separate from movement. During an order, the runner searches
for the shortest escape route whose crossings of the destination border occur
before the squad arrives. It can take an alternative exit instead of running
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

`scripts/prepare-setups.ts` performs a deterministic candidate search and keeps
six verified setups per country, with at most three from any runner region.
The search considers single regions and connected groups of up to three regions,
so an enclosure can span several states. Initial squad posts are sampled from
nearby borders plus enclosure borders.
Static cuts that still leak through unguardable fragments are skipped, and a
per-region attempt cap bounds offline search without claiming impossibility.
The browser starts at the easiest entry and advances through the ordered pool
before moving to the next country. Each setup stores a winning
sequence replayed through `PatrolGame`, including actual travel time, runner
policy, border changes, and escape checks. A sequence proves existence of a
solution within the budget. India requires an exact minimum of two orders;
Hungary requires three. The search exhausts all shorter legal sequences, not
just the stored witness. Static reachability prunes only final border sets that
cannot enclose any land. Simulation forks share immutable geography/navigation
caches while independently copying actors, orders, and history.

Static enclosure checks alone do not prove a setup is winnable: travel time and
the temporary opening at the departing post can let the runner escape. Reject
setups that already start won or lost, place squads at distinct valid posts, and
place the runner on playable land away from boundary ambiguity. Minimum spawn
distances are checked against the authoritative polylines: India requires 25 km
from any zone edge, 75 km from land exits, and 15 km from internal borders; Hungary
requires 30 km from the zone edge/land exits and 6 km from internal borders.
These playtest values live in the central configuration.

Revalidate the pool when relevant geometry, squad allocations, order budgets,
speeds, runner behaviour, or simulation rules change. A future generator can
publish new setups only after successfully replaying a winning sequence; failure
to find a sequence does not prove a candidate is impossible.

## Country progression and presentation

Use the authored country order, India followed by Hungary. The campaign contains
six challenges per country. Every India challenge has a verified two-order
minimum; every Hungary challenge has a verified three-order minimum.

Escape pressure is minimum runner travel divided by the initial available
escape-route distance. India accepts pressure in [0, 0.10]; Hungary accepts
[0.12, 0.35], so the introduction cannot randomly receive a time-critical start.
Within each country, difficulty combines solution depth, successful opening
choices, and pressure. Opening breadth probes the twelve geographically nearest
legal orders plus the known winning opening when needed; it is a sampled metric,
not a count of every possible opening. Each probe must have a verified winning
continuation within the minimum order count.

The minimum-order weight exceeds both tie-break weights combined, and tests
verify nondecreasing scores throughout the entire campaign. These metrics are
explicit playtest controls rather than a claim about every player’s experience.
Offline difficulty proofs carry a SHA-256 signature of geometry, movement rules,
runner policy version, and difficulty criteria. Runtime checks reject stale
proofs; changing policy semantics requires updating the policy version.

Start moderately zoomed around the runner, using a configured 350 km radius
for India and 100 km for Hungary. Country view fits the whole zone; Focus runner
centres the runner more closely. Selecting a squad highlights its post and pans
only if its position is outside the useful viewport. Validate camera fit and
legibility on representative screen sizes. Keep all new numeric tolerances and tuning values in
`src/game/playtest.config.ts`.

## Prototype scope

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
