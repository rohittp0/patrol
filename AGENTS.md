# Patrol agent instructions

- Always use `/grill-with-docs` before writing a plan.
- Ask only relevant questions whose answers cannot reasonably be decided by the
  agent. Make routine technical and design decisions independently, document
  assumptions, and reserve questions for material changes to the intended game.
- Use the vocabulary in `CONTEXT.md`; update it when domain terms are resolved.
- Keep playtest tuning values in `src/game/playtest.config.ts`, with units,
  constraints, and a clear distinction between agreed and starter values.
- Target Firebase Hosting in project `patrol-daac9` at `https://patrol.rohittp.com/`.
- Use Patrol’s own tactical map style with the configured OpenFreeMap sources.
  Keep provider attribution visible and never copy map API keys into source.
