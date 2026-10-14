import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import type { PatrolGame } from "./engine";
import { countryScaleKm } from "./country-scale";
import { policyForSetup, type ChallengePolicy } from "./challenge-policy";

export function setupCuration(id: string) {
  const level = CONFIG.levels.find((entry) => entry.id === id);
  return level && "setupCuration" in level ? level.setupCuration : {
    maxPerSpawnRegion: CONFIG.setups.maxSetupsPerRegion,
    minimumSpawnInternalBorders: 0, minimumEnclosureBorders: 0, requireRunnerRegionChange: false,
  };
}

/** Actual capture component, rather than the enclosure a generator hoped to form. */
export function enclosureBorders(game: PatrolGame): Set<number> {
  const secured = game.securedBorders, surrounding = new Set<number>();
  const queue = [game.runner.lastLandNode], seen = new Set(queue);
  for (let head = 0; head < queue.length; head++) for (const [next] of game.navigation.neighbors[queue[head]]) {
    const node = game.board.nodes[next];
    if (node.kind === "post") continue;
    if (node.border !== undefined && secured.has(node.border)) { surrounding.add(node.border); continue; }
    if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return surrounding;
}

export function placementDifficulty(game: PatrolGame) {
  const boundary = enclosureBorders(game);
  return {
    initiallyGuardedFraction: boundary.size ? game.setup.squadBorders.filter((border) => boundary.has(border)).length / boundary.size : 1,
    meanSquadTravelKm: game.history.length ? game.history.reduce((sum, order) => sum + order.distanceKm, 0) / game.history.length : 0,
  };
}

export function validSetupCuration(game: PatrolGame, challenge: ChallengePolicy = policyForSetup(game.board, game.setup)): boolean {
  const policy = setupCuration(game.board.id), start = game.board.nodes[game.setup.runnerNode].region;
  const internal = game.board.borders.filter((border) => border.kind === "internal" && border.regions.includes(start)).length;
  if (!game.won || internal < policy.minimumSpawnInternalBorders) return false;
  if (policy.requireRunnerRegionChange && game.board.nodes[game.runner.lastLandNode].region === start) return false;
  if (enclosureBorders(game).size < policy.minimumEnclosureBorders) return false;
  const placement = placementDifficulty(game);
  return placement.initiallyGuardedFraction <= challenge.maximumInitiallyGuardedFraction && placement.meanSquadTravelKm >= countryScaleKm(game.board.land) * challenge.minimumMeanTravelFraction;
}
