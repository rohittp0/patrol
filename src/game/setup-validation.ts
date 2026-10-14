import { PatrolGame, type GameRules } from "./engine";
import { Navigation } from "./navigation";
import type { CountryBoard, StartingSetup } from "./types";

/** Exhaust every legal first order; static pruning cannot discard a possible win. */
export function hasOneOrderWin(board: CountryBoard, setup: StartingSetup, rules: GameRules, navigation: Navigation): boolean {
  return hasWinWithin(new PatrolGame(board, setup, rules, navigation), 1);
}

/** Before simulating a first move, check whether either possible final guard
 * set can enclose any land. This ignores timing/runner position, so it only
 * rejects statically impossible branches and cannot discard an actual win. */
function canEncloseWithinTwo(game: PatrolGame, squad: number, destination: number): boolean {
  const after = game.securedBorders;
  after.delete(game.squads[squad].border!); after.add(destination);
  if (game.navigation.canEnclose(after)) return true;
  for (let second = 0; second < game.squads.length; second++) {
    const origin = second === squad ? destination : game.squads[second].border!;
    for (let border = 0; border < game.board.borders.length; border++) {
      if (after.has(border)) continue;
      const final = new Set(after); final.delete(origin); final.add(border);
      if (game.navigation.canEnclose(final)) return true;
    }
  }
  return false;
}

/** Exhaust legal orders to this depth. Prune only impossible final enclosures. */
export function hasWinWithin(game: PatrolGame, orders: number): boolean {
  if (game.won) return true;
  if (game.outcome.kind !== "playing" || orders <= 0) return false;
  const secured = game.securedBorders;
  for (let squad = 0; squad < game.squads.length; squad++) for (let border = 0; border < game.board.borders.length; border++) {
    if (secured.has(border)) continue;
    if (orders === 1) {
      const after = new Set(secured);
      after.delete(game.squads[squad].border!);
      after.add(border);
      if (!game.navigation.canEnclose(after)) continue;
    }
    if (orders === 2 && !canEncloseWithinTwo(game, squad, border)) continue;
    const branch = game.fork();
    if (!branch.issueOrder(squad, border)) continue;
    branch.resolveOrder();
    if (hasWinWithin(branch, orders - 1)) return true;
  }
  return false;
}
