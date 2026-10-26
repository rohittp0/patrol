# Browser-owned progression with private Firestore saves

Patrol is a casual single-player game without competitive or paid rewards. The
user chose browser-calculated progression over a trusted Cloud Functions backend
to keep deployment simple and avoid the Functions billing prerequisite. Firebase
Authentication identifies each player; Firestore rules restrict saves to their
owner and validate basic document shape, while transactions and revision checks
protect normal concurrency and retry behavior.

The browser calculates win rewards, squad purchases, upgrades and training
clocks. A determined player can manipulate their own progress, including money
and training time. Privacy is enforced; anti-cheating is intentionally outside
this release. Future competitive or paid rewards would require a new authority
model rather than treating these client-owned balances as trusted.
