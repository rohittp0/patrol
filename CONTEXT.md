# Patrol

A pursuit game played on the real world map. The player commands squads to catch a fugitive before they escape the patrol zone by land.

## Language

**Patrol zone**:
The geographic area under the player's patrol authority, currently one non-island country with detached islands excluded. A combined zone can encompass adjoining countries, with their shared national boundaries inside the zone.
_Avoid_: Authoritative zone

**Level**:
A numbered, playable mission with its own starting setup, patrol zone, move budget, reward, and best move count.
_Avoid_: Challenge, hunt in player-facing copy

**Campaign**:
The ordered progression through levels and then successive countries, beginning with India for every player. Only India is enabled in the current release scope; other countries form future sequential progression.

**Opening country**:
The country in which the campaign begins, currently India for every player.

**Campaign order**:
The numbered sequence of levels within each country, followed by the next country in the campaign. Every player follows the same progression beginning in India, regardless of location.

**Guided level**:
Level 1, beginning immediately after Play: select three squads, choose a squad and a destination, preview movement, deploy, and continue through the first capture. Level 2 has no guide. Level 3 has a separate Academy lesson for recruiting Rapid Action and starting its first upgrade, with enough earned money for both. The timer explains unavailability and sequential upgrades; tutorials end there. Both lessons are mandatory. Completing the first capture ends field training; recruiting and starting the first Rapid upgrade enables the Academy lesson’s completion action. Completion is saved with campaign progress.

**Campaign progress**:
The player's campaign position, level results, money, squad collection, training progress, last-used squad selection, and current chase state. Signed-in players can continue their saved progress on another device.

**Level reward**:
The level's base money award multiplied by the winning move-count multiplier: three times for fewer than three moves, twice for three through five moves, and once for six or more moves. Base awards increase with progression.

**Improvement reward**:
The positive difference between a replay's level reward and the highest reward already earned for that level, payable only when the player wins in fewer moves than their previous best. A better move count within the same multiplier tier improves the record without awarding more money.

**Case file**:
The illustrated historical fugitive and sourced story assigned to one level. All fifteen India levels use distinct members of the existing case cast, beginning with Veerappan; their India encounters are fictional and do not relocate their historical biographies. A case file shows running speed during squad selection and remains inspectable while its level is locked. Historical outcomes retain their sourced arrest, surrender, or death.

**Starting setup**:
The fugitive's initial position and the initial border posts associated with a level's deployment slots. Selected ground squads deploy automatically at their slots' posts, while Helicopter Squads begin in reserve; each level has a verified winning sequence with a stated roster.

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

**Patrol Squad**:
A standard squad with ordinary movement and border guarding, without a special ability. Players begin with three Patrol Squads.

**Rapid Action Squad**:
A squad with faster movement than a Patrol Squad. Training upgrades its movement speed.
_Avoid_: Rapid action force

**Helicopter Squad**:
A squad manually deployed to a player-chosen border post to guard its border temporarily, returning to reserve when that duration expires so it can deploy again in the same level. Training can extend its guarding duration, measured in moves, and shorten its deployment time.
_Avoid_: Helicopter crew

**Deployment time**:
The time a Helicopter Squad takes to reach its chosen border post, fixed for its training level and independent of distance. Deployment consumes one move, and guarding begins on arrival.

**Marksman Squad**:
A squad that instantly kills a fugitive entering its firing radius while it is stationed at a border post; the ability is inactive during relocation and resumes on arrival. Training upgrades its firing radius.
_Avoid_: Firing squad

**Squad collection**:
The player's three starting Patrol Squads and at most one purchased squad of each specialist type, from which they select squads before a level. Squads undergoing training are unavailable for selection.

**Reserve**:
A selected Helicopter Squad's state while waiting to deploy, either before its first deployment or after its guarding duration expires. A squad in reserve guards no border; each deployment consumes a move and takes its deployment time.

**Upgrade track**:
The ordered sequence of upgrades for an individual squad, with each upgrade becoming available only after the preceding upgrade is completed. Every upgrade requires money and training time, with costs and training durations increasing through the track.

**Training**:
The real-world waiting period required to complete a purchased squad upgrade. The squad is unavailable for level selection while training, and gains the upgrade when training finishes. Each specialist's first upgrade takes longer than the preceding specialist's final upgrade, in the order Rapid Action, Helicopter, Marksman. Existing training keeps its promised completion time.

**Deployment slot**:
One optional place for a selected squad in a level; players may start with slots empty, including while owned squads are training. Players begin with three slots; a fourth and fifth become available to purchase through progression at levels 15 and 25 respectively.

**Unlock requirement**:
A campaign progression requirement that must be met before a squad or additional deployment slot becomes available to purchase. Unlocking a purchase does not grant it for free.

**Move**:
A single squad relocation or Helicopter Squad deployment, resolved before the next move while the fugitive travels. Guarding begins on arrival, and game time stays paused between completed moves; a short relocation can finish before the fugitive completes its minimum travel for that move.
_Avoid_: Order in player-facing copy

**Fugitive travel floor**:
The minimum land distance the fugitive travels during an order, scaled to the patrol zone's land area. Escape or containment can end the order sooner. Longer squad journeys can give the fugitive more travel time.

**Land movement**:
Movement freely across land at a constant speed, without being restricted to roads. Ground squads and the fugitive must take land-only routes around ocean water; Helicopter Squad deployment uses air travel.

**Move budget**:
The maximum number of orders allowed in a level. Exceeding it causes the player to lose.
_Avoid_: Order budget in player-facing copy

**Score**:
The move budget minus the number of orders used to win. Winning on the final allowed order gives a score of zero.

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
A closed enclosure around the fugitive formed by guarded borders alone or by guarded borders together with coastline, sealing every land escape route. Achieving containment wins the level, as does a stationed Marksman Squad killing the fugitive within its firing radius.

Engine identifiers such as `runner`, `order`, and `secured` remain internal aliases; player-facing copy uses fugitive, move, and guarded.

**Running speed**:
The fugitive's simulated kilometres per hour, independently tunable for each level in the campaign opponent configuration. It is a game value rather than a claim about the historical person. Longer squad journeys allow more fugitive travel; thinking time is paused. Playback uses one uniform accelerated clock across orders, so long journeys never silently increase the displayed running speed.

**Movement preview**:
A detached simulation of the selected squad's proposed order, showing its blue route, the fugitive's gold route and endpoint, travel distance and arrival time, including turns at border closures. A squad and destination can be selected in either order; changing the squad keeps the chosen post and updates the preview. Deploy commits the previewed order and costs one move. The faint gold escape route remains visible before selecting a destination.

**Background save**:
A campaign update that becomes playable immediately while its cloud copy catches up. Unsynced progress remains on the current device and retries after reconnecting. A newer save from another device is kept separate so one campaign cannot silently overwrite the other.

**Capture celebration**:
Visual feedback at the fugitive's actual capture location, accompanied by a sound cue when sound is enabled. The victory screen then shows base reward, move bonus, replay improvement and the resulting coin balance, with Next Level and Home actions.
