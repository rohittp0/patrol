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

- The opening HTML plays a tiny squad/fugitive chase while files and saved progress
  load, with a static scene for reduced-motion users and early map preloading.
- Every level has a distinct illustrated case, starting with Veerappan. Inspect
  any locked case to preview its running speed; play unlocks remain sequential.
- Level 1 guides roster selection through the first win. Level 2 is unguided;
  Level 3 guides Rapid recruitment and one upgrade, then tutorials end. Both lessons are mandatory. The
  minimum 75 coins from the first two wins cover both costs (25 + 20).
- Choose a squad and a free post in either order, inspect both paths, then Deploy.
  Changing squads retains the destination and recalculates the preview. Playback
  uses one uniform clock; distant orders never secretly accelerate the fugitive.
- Every level allows 15 moves. Guard every land escape route, or intercept the
  fugitive with a stationed Marksman Squad. Thinking time is paused.
- Moving a ground squad opens its origin immediately and guards its destination
  on arrival. The fugitive moves during the order; ocean is impassable to ground
  units and the fugitive.
- Start with three Patrol Squads and three deployment slots. Slots may be empty.
  Additional deployment slots are future content.
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
Google sign-in uses Firebase Auth's `GoogleAuthProvider` and `linkWithPopup` to
preserve the anonymous player's UID and save. Keep the configured
`patrol-daac9.firebaseapp.com` auth domain: the Hosting domain alone does not
register a new Google OAuth callback. The popup callback is
`https://patrol-daac9.firebaseapp.com/__/auth/handler`.

Google sign-in is optional and prompted after completing Level 4 or making the
first purchase, whichever happens first. Linking a new Google account keeps the
same player save. If the Google account already has a campaign, an explicit
choice loads that save and preserves a browser-local guest backup; balances are
never silently combined.

Firestore stores the collection, wallet, results, selection, training deadlines
and active attempt per UID. A restored chase is rebuilt in the browser from its commands and
partial move time. Every action validates and updates locally immediately. An
ordered, durable outbox syncs immutable snapshots in the background, including
attempt IDs and absolute training deadlines. A lost response is deduplicated by
its receipt; refreshing with pending progress restores the local campaign without
waiting for cloud reads. Reconnecting retries automatically. A conflicting newer
cloud save pauses uploads, preserving the local campaign; the profile offers an
explicit cloud-save choice with a local backup. Prototype v1 saves are not converted or credited to the new campaign.

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

Use the Playwright CLI with `scripts/check-game-ui.js` for the first wins,
mandatory guides and recruitment/training while cloud requests are held. It also
checks delayed persistence and reload recovery. `scripts/check-game-layout.js`
covers phone/landscape/tablet/desktop capture framing, `scripts/check-game-audio.js`
covers playback and mute behavior, and `scripts/check-basemap-access.ts` checks
map source/tile/font availability. Browser callbacks close their own contexts;
close the CLI session too.

- [CONTEXT.md](CONTEXT.md): player-facing vocabulary.
- [Design decisions](docs/progression-decisions.md): agreed scope.
- [Tuning configuration](src/game/playtest.config.ts): all playtest numbers,
  documented as agreed or starter values with units and limits.
- [Level geometry](docs/level-design.md): source attribution and legacy validation.

The app owns its tactical basemap style in `src/game/patrol-map-style.ts`, using
public OpenFreeMap vector tiles and Noto fonts. It has no dependency on the former
style server or its embedded key. OpenFreeMap/OpenMapTiles/OpenStreetMap attribution
stays visible. The separate, authoritative gameplay geometry comes from pinned
Natural Earth data with retained source attribution/checksums.

All toast messages dismiss automatically after 20 seconds; manual dismissal
remains available.

The original procedural soundtrack and effects require no downloads. Sound starts
on a gesture, supports a persistent mute control and suspends when the page is
hidden. Gains and base/pursuit tempos live in the tuning configuration.

Capture focuses the actual fugitive position before the reward card. Reduced
motion disables camera/confetti animation. The winning card shows base × bonus,
net new coins and previous balance + reward = new balance; replay payouts remain
capped to improvement. It offers Next and a secondary Home action.

Training times increase across specialist tracks (starter values):

| Squad | Upgrade 1 | Upgrade 2 | Upgrade 3 | Upgrade 4 |
| --- | --- | --- | --- | --- |
| Rapid Action | 30 sec | 1 min | 3 min | 10 min |
| Helicopter | 15 min | 30 min | 1 hour | 2 hours |
| Marksman | 3 hours | 4 hours | 6 hours | 8 hours |

These are real training times; deployment/movement hours are simulated chase time.
In-progress training retains its stored deadline.

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
