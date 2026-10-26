# Patrol

A mobile-first pursuit strategy game on the real map. Every player begins with
15 consecutive India levels and three Patrol Squads. Complete levels to earn
money, recruit specialists and train their abilities. Other countries are future
sequential campaign content.

## Play locally

Use Node.js 22 and Java 21 or newer for the Firebase emulators.

```sh
npm ci
firebase emulators:start --only auth,firestore --project patrol-daac9
```

In another terminal:

```sh
VITE_FIREBASE_EMULATORS=1 npm run dev
```

Open **http://localhost:3000/**. This uses local accounts and local Firestore,
not production player saves. The development-only `?local=1` option is an isolated
browser-local gameplay sandbox; its progress is not uploaded. Production builds save private player documents directly to Firestore.

## Campaign and squads

- Every level allows 15 moves. Guard every land escape route, or intercept the
  fugitive with a stationed Marksman Squad. Thinking time is paused.
- Moving a ground squad opens its origin immediately and guards its destination
  on arrival. The fugitive moves during the order; ocean is impassable to ground
  units and the fugitive.
- Start with three Patrol Squads and three deployment slots. Slots may be empty.
  The Level 15 and Level 25 additional slots are future purchase placeholders.
- Recruit each specialist once: Rapid Action at Level 3, Helicopter at Level 6,
  Marksman at Level 10. Levels 6/10 and numerical prices/stats are starter values.
- Rapid Action trains movement speed. Helicopter training alternates longer
  guarding and shorter deployment time. Marksman trains its firing radius.
- Helicopters start in reserve. Select any free post and Deploy: this costs one
  move and a distance-independent deployment time. Guarding begins on arrival;
  the deployment move does not decrement its counter. Subsequent resolved moves
  decrement it. Expiry returns the squad to reserve for reuse. Relocating it
  before expiry immediately opens its old border and uses another deployment.
- Marksman range is active only while stationed. The simulation checks range
  crossings between frames; moving across the entire circle cannot bypass a shot.
- Upgrades are sequential and cost money plus real-world training time. Training
  continues while away. A squad in training cannot start another level, but
  empty slots are allowed. The academy blocks training a squad in an active
  saved attempt; finish or abandon that attempt first.
- Wins below 3 moves earn 3× base money, 3–5 moves earn 2×, 6–15 earn 1×. Replays
  pay only the positive increase above that level's highest paid reward, and only
  for a strictly better move count. Improving within one tier pays zero.

The home screen, level selection, academy, roster picker and gameplay all support
phones, tablets and desktop. Newspaper and sharing are removed from the playable
app. Legacy prototype modules, art and country fixtures remain available for
regression checks; the new app does not load or expose those features.

## Saves and security

The game starts a Firebase anonymous session without a sign-in interruption.
Google sign-in is optional and prompted after completing Level 4 or making the
first purchase, whichever happens first. Linking a new Google account keeps the
same player save. If the Google account already has a campaign, an explicit
choice loads that save and preserves a browser-local guest backup; balances are
never silently combined.

Firestore stores the collection, wallet, results, selection, training deadlines
and active attempt per UID. A restored chase is rebuilt in the browser from its commands and
partial move time. A local checkpoint journal recovers interrupted uploads after
refresh. Conflicting device writes require a reload instead of overwriting newer
progress. Prototype v1 saves are not converted or credited to the new campaign.

Players can read and write only their own save. Firestore rules reject other
players' access, listing, deletion, malformed top-level saves and stale revision
updates. Transactions and mutation IDs recover interrupted uploads and prevent
accidental duplicate operations or lost updates between tabs/devices.

The browser calculates wins, rewards, purchases and training deadlines. This is
a casual single-player trust model: players who deliberately modify their own
save or system clock can cheat. The rules protect privacy and save structure;
they do not prove gameplay results or enforce server-side training time. No
Cloud Functions backend is required.

## Validation and tuning

```sh
npm test
npm run build
# With the emulators running:
npm run test:saves
npm run test:rules
# After changing rules, stats or campaign authoring:
npm run prepare:campaign
```

The public campaign manifest contains 15 distinct spawns and replayed winning
witnesses with recommended rosters. Geometry and economy hashes are checked by
tests. Basic/less-trained same-route comparisons are recorded separately: a
failed witness is not proof that every possible weaker-roster strategy fails.
The campaign's prices and progression remain playtest tuning, not a claim of
proven global optimal solutions. See [rewrite verification](docs/rewrite-verification.md).

Use the existing Playwright CLI workflow with `scripts/check-progression.js` for
mobile/desktop layout, captures, purchases, training and refresh recovery. The
callback creates and closes its own browser context; close the CLI session too.

- [CONTEXT.md](CONTEXT.md): player-facing vocabulary.
- [Design decisions](docs/progression-decisions.md): agreed scope.
- [Tuning configuration](src/game/playtest.config.ts): all playtest numbers,
  documented as agreed or starter values with units and limits.
- [Level geometry](docs/level-design.md): source attribution and legacy validation.

The visual basemap loads directly from the owner-controlled
`https://dashboard.lascadian.com/maps/default.json`. Its embedded MapTiler key is
not copied into source. Authoritative gameplay geometry is compiled separately
from pinned Natural Earth data, with retained attribution and source checksums.

## Deploy to Firebase

Project: **patrol-daac9**. Domain: **https://patrol.rohittp.com/**.
Hosting serves Vite's `dist/` at `/`. The CLI builds the app and backend before
deploying; the Firebase welcome-page files have been removed.

```sh
npm ci
firebase deploy --project patrol-daac9
```

This version uses Firebase Hosting, Authentication and Firestore, with no
Functions deployment or Functions billing prerequisite. It can use the existing
Spark project within its service quotas. Google and anonymous sign-in and the
custom Auth domain are configured; real Google OAuth still needs a human
acceptance run.

Pushing `main` runs unit/build/Auth-and-Firestore-emulator checks, then deploys
Hosting using the existing `FIREBASE_SERVICE_ACCOUNT_PATROL_DAAC9` secret. CI
keeps its existing Hosting permissions. Deploy security-rule changes locally
with `firebase deploy --only firestore:rules --project patrol-daac9`, or deploy
all configured services with the command above. Pull requests run the same
checks without production credentials.

The old GitHub Pages deployment workflow is removed. Existing Pages content is
not deleted by this repository change. Roll back compatible code, campaign and save-schema versions together.
