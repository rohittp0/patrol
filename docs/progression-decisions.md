# Agreed progression rewrite decisions

This records settled design decisions from the ongoing interview, not an
implementation plan or a claim that the rewrite is complete.

- India is the opening campaign for every player, with at least 15 consecutive
  levels of increasing difficulty. Other countries follow sequentially in the
  future and are disabled for this release.
- Existing prototype players start a fresh campaign at Level 1. Old hunt results,
  scores, and in-progress chases are not converted into new campaign unlocks,
  rewards, or wallet balances. This reset applies to the prototype transition;
  subsequent new-campaign saves must continue normally across sessions/devices.
- The move budget is 15. Suitable squad upgrades reduce the moves needed; later
  levels may be impossible without them. All levels require new balance and
  verification under the new mechanics.
- Players begin with three Patrol Squads and three deployment slots. The fourth
  and fifth slots are future purchases labeled for Levels 15 and 25; purchasing
  those extra slots was deferred in the original scope.
- Players may start with empty slots. Training can leave fewer than three squads
  available, and squads in training cannot be selected.
- Specialist types are Rapid Action Squad, Helicopter Squad, and Marksman Squad.
  Their purchase-price order is Rapid Action, Helicopter, then Marksman.
- Each specialist type can be purchased only once. The collection therefore
  contains the three starting Patrol Squads and up to three specialists, each
  with its own upgrade track; duplicate specialist purchases are unavailable.
- Marksman Squad fires only while stationed at a border post. Its firing radius
  is inactive during relocation and resumes on arrival.
- Initial purchases should be cheap so players experience specialist abilities
  early. Rapid Action Squad becomes available at Level 3.
- Each individual squad has a sequential upgrade track. Every upgrade costs
  money and training time; the next upgrade becomes available after the previous
  one finishes. Training cost and duration rise, beginning with 30 seconds,
  1 minute, and 3 minutes; later values need tuning.
- Helicopter deployment consumes one move and takes a distance-independent time
  shortened by training. Guarding begins on arrival and lasts a number of moves
  extendable by training. On expiry, the squad returns to reserve and can deploy
  again in the same level, paying the move and deployment time again.
- Level base rewards increase through progression. Wins in fewer than 3 moves
  earn 3 times the base reward; 3–5 moves earn twice the base reward; 6 or more
  earn the base reward. A replay pays only the positive difference from the
  highest reward already earned, and only on a strictly better move count.
- The mobile-first home screen provides levels and the training academy. Squad
  selection precedes each level and defaults to the last-used selection where
  available. Ground squads deploy automatically; helicopters deploy manually
  through a border post's Deploy action.
- Google sign-in is optional. Prompt after completing Level 4 or after the first
  purchase, whichever comes first. Firestore stores signed-in player progress
  so play can continue on another device. This timing replaces the original
  prompt after Level 1.
- Firebase Hosting targets project `patrol-daac9` and `patrol.rohittp.com`.
  The user reports deploying Hosting and connecting the domain; live domain
  access was not verified in this interview environment.
- Remove the newspaper and sharing features. Fugitive powerups are future scope.

- The user chose browser-owned progression instead of a trusted Functions
  backend. Browser code handles rewards, purchases, wins and training time;
  authenticated players save directly to their private Firestore documents.
  Deliberate cheating of a player's own progress is accepted for this release.
  Transactions, save revisions and mutation IDs protect normal retry/concurrency
  behavior. Firebase deployment uses Hosting and Firestore without Functions.
