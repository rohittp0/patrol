# Patrol

A pursuit game played on the real world map. The player commands squads to contain a runner before the runner escapes the patrol zone by land.

## Language

**Patrol zone**:
The geographic area under the player's patrol authority, currently one non-island country with detached islands excluded. A combined zone can encompass adjoining countries, with their shared national boundaries inside the zone.
_Avoid_: Authoritative zone

**Level**:
A country stage defined by its patrol zone, squad allocation, and order budget. Levels follow an authored country sequence from easier to harder and contain ordered challenges.

**Challenge**:
A verified starting setup in the campaign. Challenges progress from easier to harder within each country before advancing to the next country.

**Starting setup**:
The runner's initial position and the squads' initial assignments to border posts. Every starting setup must be verified as winnable within its level's order budget.

**Runner**:
The always-visible, computer-controlled opponent trying to escape the patrol zone by land. It chooses a land escape route, anticipating whether a travelling squad will close a border before it can cross. It recalculates whenever an order changes the border network.
_Avoid_: Fugitive, enemy

**Escape**:
The runner's crossing from inside the patrol zone to outside it by land. An escape causes the player to lose; there is no specific destination or safehouse.

**Land exit**:
A portion of the patrol zone's outer boundary that the runner could cross by land to escape.

**Squad**:
A player-controlled unit that secures a border while stationed at its border post. During relocation, it secures neither its origin nor its destination.
_Avoid_: Patrol team, guard, guards

**Order**:
A single squad relocation from one border post to another, resolved before the next order. A short relocation can finish before the runner completes its minimum travel for that order. The squad secures its destination on arrival; game time stays paused between completed orders.
_Avoid_: Player move

**Runner travel floor**:
The minimum land distance the runner travels during an order, scaled to the patrol zone's land area. Escape or containment can end the order sooner. Longer squad journeys can give the runner more travel time.

**Land movement**:
Movement freely across land at a constant speed, without being restricted to roads. Squads and the runner must take land-only routes around ocean water.

**Order budget**:
The maximum number of orders allowed in a level. Exceeding it causes the player to lose.
_Avoid_: Move budget

**Score**:
The order budget minus the number of orders used to win. Winning on the final allowed order gives a score of zero.

**Hint**:
An optional recommendation of a squad relocation from the current position. A hint can identify a verified winning continuation or a move that buys more escape distance. Hints currently cost no orders or points and never issue an order on the player's behalf.

**Border**:
A designated, non-closed boundary segment inside the patrol zone or along its outer land boundary that a squad can secure. Borders may follow portions of real administrative boundaries.

**Border network**:
The manually defined collection of borders in a patrol zone. Every border endpoint meets another border, the coastline, or the zone's outer boundary, with no loose ends inland.

**Border post**:
The circular marker at the middle of a border that identifies its squad destination and holds at most one squad. Occupied posts are unavailable as destinations for another squad.
_Avoid_: Guard post

**Icon marker**:
An icon showing the runner's current position or a squad's position during relocation.

**Secured border**:
A border protected by a squad stationed at its border post that the runner cannot cross. A squad's protection ends immediately when it departs and begins when it arrives.
_Avoid_: Guarded border

**Open border**:
A border without protection from a stationed squad that the runner can cross.
_Avoid_: Unguarded border

**Coastline**:
The implicit, impassable boundary between land and ocean. It can complete an enclosure together with secured borders.
_Avoid_: Ocean border

**Containment**:
A closed enclosure around the runner formed by secured borders alone or by secured borders together with coastline, sealing every land escape route. Achieving containment is the player's win condition.
