# Patrol

A pursuit game played on the real world map. The player commands squads to catch a fugitive before they escape the patrol zone by land.

## Language

**Patrol zone**:
The geographic area under the player's patrol authority, currently one non-island country with detached islands excluded. A combined zone can encompass adjoining countries, with their shared national boundaries inside the zone.
_Avoid_: Authoritative zone

**Level**:
A country stage defined by its patrol zone and move budget. Each challenge owns its squad allocation, so hunts in the same country can have different numbers of squads. Levels follow an authored country sequence from easier to harder and contain ordered challenges.

**Challenge**:
A verified starting setup in the campaign. The first two challenges of each country introduce the chase with a two-move solution. Later challenges require at least three moves. Every challenge in a country starts in a different state or province. Difficulty restarts at the introductory tier when entering a new country.

**Guided hunt**:
The opening campaign challenge, taught by highlighting the border post and squad for each move through the capture. Players follow those moves or skip guidance to take command freely.

**Campaign progress**:
The current challenge and chase state, remembered on this browser so refreshing continues the same hunt. Previous hunt replays the preceding campaign challenge, including across country boundaries.

**Case file**:
The historical fugitive and story assigned to one challenge. Each challenge introduces a different case. The chase is imagined; its epilogue recounts how the real manhunt ended, whether by arrest, surrender, or death.

**Starting setup**:
The fugitive's initial position and the squads' initial assignments to border posts. The number of assignments is the hunt's squad allocation, chosen from its country's supported counts in the tuning configuration. Every starting setup must be verified as winnable within its level's move budget.

**Fugitive**:
The always-visible, computer-controlled opponent trying to escape the patrol zone by land. It chooses a land escape route, anticipating whether a travelling squad will close a border before it can cross. A destination remains unguarded until squad arrival, so the fugitive can race across before it closes. It takes direct visible paths within each land region and recalculates from its actual position whenever an order changes the border network.
_Avoid_: Runner, enemy

**Escape**:
The fugitive's crossing from inside the patrol zone to outside it by land. An escape causes the player to lose; there is no specific destination or safehouse.

**Land exit**:
A portion of the patrol zone's outer boundary that the fugitive could cross by land to escape.

**Squad**:
A player-controlled unit that guards a border while stationed at its border post. During relocation, it guards neither its origin nor its destination.
_Avoid_: Patrol team, guard, guards

**Move**:
A single squad relocation from one border post to another, resolved before the next order. A short relocation can finish before the fugitive completes its minimum travel for that order. The squad guards its destination on arrival; game time stays paused between completed orders.
_Avoid_: Order in player-facing copy

**Fugitive travel floor**:
The minimum land distance the fugitive travels during an order, scaled to the patrol zone's land area. Escape or containment can end the order sooner. Longer squad journeys can give the fugitive more travel time.

**Land movement**:
Movement freely across land at a constant speed, without being restricted to roads. Squads and the fugitive must take land-only routes around ocean water.

**Move budget**:
The maximum number of orders allowed in a level. Exceeding it causes the player to lose.
_Avoid_: Order budget in player-facing copy

**Score**:
The move budget minus the number of orders used to win. Winning on the final allowed order gives a score of zero.

**Hint**:
An optional recommendation of a squad relocation from the current position. Four hints are available per browser; using the last starts a thirty-minute wait before all four refill. Hints cost no orders or points and never issue a move on the player's behalf.

**Border**:
A designated, non-closed boundary segment inside the patrol zone or along its outer land boundary that a squad can guard. Borders may follow portions of real administrative boundaries.

**Border network**:
The manually defined collection of borders in a patrol zone. Every border endpoint meets another border, the coastline, or the zone's outer boundary, with no loose ends inland.

**Border post**:
The circular marker at the middle of a border that identifies its squad destination and holds at most one squad. Occupied posts are unavailable as destinations for another squad.
_Avoid_: Guard post

**Icon marker**:
An icon showing the fugitive's current position or a squad's position during relocation.

**Guarded border**:
A border protected by a squad stationed at its border post that the fugitive cannot cross. A squad's protection ends immediately when it departs and begins when it arrives.
_Avoid_: Secured border in player-facing copy

**Unguarded border**:
A border without protection from a stationed squad that the fugitive can cross.
_Avoid_: Open border in player-facing copy

**Coastline**:
The implicit, impassable boundary between land and ocean. It can complete an enclosure together with guarded borders.
_Avoid_: Ocean border

**Containment**:
A closed enclosure around the fugitive formed by guarded borders alone or by guarded borders together with coastline, sealing every land escape route. Achieving containment is the player's win condition.

**Capture report**:
The actual in-game capture location, moves, squads, score, and case file used to create the newspaper. Its game capture is fictional; its historical column is sourced.

**Front-page clipping**:
A shareable newspaper cutting celebrating the player's imagined capture, with a separate sourced historical ending. The first captured challenge in each country opens the editor once per browser. Skip advances to the next challenge; later captures offer Make headlines on the ordinary result card. India uses its own arrest illustration and default officer; USA and Hungary share the existing artwork.

**Player profile**:
A saved name, final circular head crop, and random anonymous ID. Original uploads and crop coordinates are discarded when the newspaper editor closes. The name identifies the player's play sessions; photos stay in the browser unless the player shares or downloads their newspaper.

Engine identifiers such as `runner`, `order`, and `secured` remain internal aliases; player-facing copy uses fugitive, move, and guarded.
