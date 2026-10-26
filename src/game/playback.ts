import type { PatrolGame } from "./engine";
import { ECONOMY } from "./collection";
/** Advance the visible chase without changing the simulation's movement rules. */
export function advancePlayback(game: PatrolGame, realSeconds: number) {
  if (!game.activeOrder) return;
  // A long squad route must not make the fugitive suddenly run faster.
  const rate = ECONOMY.playbackScale / 3600;
  game.advanceHours(realSeconds * rate);
}
