import type { PlayerState } from "./collection";
import type { PatrolGame } from "./engine";
export function needsFieldLesson(player: PlayerState) {
  return !player.results["1"] && !player.tutorials?.field;
}
export function academyLesson(
  player: PlayerState,
): "purchase" | "train" | "timer" | null {
  // No surprise onboarding for an existing player beyond the requested cutoff.
  if (player.unlocked !== 3 || player.results["3"] || player.tutorials?.academy)
    return null;
  const rapid = player.squads.rapid;
  if (!rapid) return "purchase";
  if (rapid.training || rapid.step > 0) return "timer";
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
