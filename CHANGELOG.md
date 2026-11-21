# Changelog

## 2.2.0 — 2026-11-20

- Gentler difficulty curve: Levels 1–8 are two-move wins that the starting
  Patrol squads can solve; specialists become necessary from Level 11.
- Squad unlocks paced to match: Rapid Action at Level 6 (with the Academy
  lesson), Helicopter at Level 11, Marksman at Level 16.
- Lower level rewards (12 + 1 per level before the move multiplier).
- New Europe patrol zone with Levels 26–40 across eight countries.
- Level 1 tutorial explains the game with self-paced briefing cards, free
  previews and a debrief after each move.
- Restart button with confirmation beside the sound toggle.
- Fixed: the game froze when the fugitive escaped during a move.

Saves keep their unlocked level, money, squads and training. Deploy the updated
`firestore.rules` with this release so Levels 26–40 can be saved.
