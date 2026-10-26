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

- The full tutorial starts on Play at Level 1 and teaches actual roster selection,
  squad selection, destination choice, movement preview and deployment through
  the first win. Level 2 has no tutorial. Level 3 returns only for Academy,
  one Rapid Action purchase and one sequential upgrade, including the training
  timer and squad unavailability. No guided unlocks follow Level 3.
- The minimum first-two-level payout is 75 coins. Rapid recruitment costs 25
  and its first upgrade costs 20, leaving 30 without replaying either level.
- Restore the illustrated, sourced case cast, beginning with Veerappan. Assign
  a distinct character to every one of the 15 India levels. Existing global
  characters join fictional India pursuits; biographical facts retain their
  original settings and sources. Locked levels allow inspection, never play.
- Running speed is the only opponent gameplay attribute shown. Every level has
  its own positive simulated km/h tuning entry in playtest.config.ts.
- Order flow is squad → free post → preview → Deploy. Preview includes the
  actual future trajectory and timing, including closure-triggered turns,
  rather than suggesting constant distance per turn. Both actors pause between
  orders. Specialist speed, fixed helicopter deployment and firing remain intact.
- Playback uses one uniform accelerated clock. Long squad journeys no longer
  increase the fugitive's on-screen speed to squeeze into a four-second cap;
  the path preview and the underlying simulated running speed remain consistent.

- Campaign actions update optimistically and persist in the background. UI flow
  must not wait for Firebase acknowledgements. Durable, ordered snapshots retain
  exact attempt identity, rewards and training deadlines across interruptions.
- Replace the supplied style with a Patrol-owned tactical map style using public
  vector data/fonts. Actual rendered tiles and labels are acceptance criteria;
  a successful style request or drawn gameplay borders alone is insufficient.
- Remove gameplay Hint, both manual focus buttons and the top information button,
  including their active-app handlers and hint worker dependency. Normal map
  gestures and automatic guide/capture camera framing remain available.
- Tutorials cannot be skipped. Level 1 teaches the first capture, then Level 3
  requires Rapid recruitment, one upgrade and acknowledgement of training.
  Prior Skip flags alone do not bypass those required actions.
- Add original music and game-event effects, with a persistent mute control and
  no sound before a user gesture or while the page is hidden.
- A capture immediately celebrates at the fugitive's actual map position. The
  winning screen displays the reward calculation and balance addition, removes
  Academy, and offers Next plus a secondary Home button with its proper icon.
- Each later specialist's first training duration exceeds the previous
  specialist's last. Starter ladders: Rapid 30/60/180/600 seconds; Helicopter
  900/1800/3600/7200 seconds; Marksman 10800/14400/21600/28800 seconds. Active
  training retains its existing deadline rather than being retroactively extended.
- A squad and free border post may be selected in either order, including the
  taught move during field training. Switching squads keeps the destination and
  recomputes the preview. Neither selection spends a move; Deploy does.
- All toast messages dismiss after 20 seconds. A new message receives its own
  full 20-second deadline and may also be dismissed manually.
