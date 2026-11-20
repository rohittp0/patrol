import { ECONOMY, type PlayerState } from "./collection";
/** The Academy lesson runs at the level that first unlocks Rapid Action. */
export const ACADEMY_LESSON_LEVEL = ECONOMY.catalog.rapid.unlock;
import type { PatrolGame } from "./engine";
export function needsFieldLesson(player: PlayerState) {
  return !player.results["1"];
}
export function academyLesson(
  player: PlayerState,
): "purchase" | "train" | "timer" | null {
  // No surprise onboarding for an existing player beyond the requested cutoff.
  if (player.unlocked !== ACADEMY_LESSON_LEVEL || player.results[String(ACADEMY_LESSON_LEVEL)]) return null;
  const rapid = player.squads.rapid;
  if (!rapid) return "purchase";
  if (rapid.training || rapid.step > 0)
    return player.tutorials?.academy ? null : "timer";
  return "train";
}
/** An old off-script attempt remains free play; never impose an invalid witness. */
export function guidedOrder(game: PatrolGame) {
  if (
    !game.history.every(
      (m, i) =>
        m.squad === game.setup.witness[i]?.squad &&
        m.to === game.setup.witness[i]?.border,
    )
  )
    return null;
  return (
    game.setup.witness[
      game.activeOrder ? game.ordersUsed - 1 : game.ordersUsed
    ] ?? null
  );
}
