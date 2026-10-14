import { PatrolGame, type GameRules } from "./engine";
import { Navigation } from "./navigation";
import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import { policyForSetup, type ChallengePolicy } from "./challenge-policy";
import { placementDifficulty, setupCuration } from "./setup-curation";
import { countryScaleKm } from "./country-scale";
import type { CountryBoard, StartingSetup } from "./types";

/** Bind proofs to geography, movement, per-hunt progression and curation. */
export async function setupRulesSignature(board: CountryBoard, rules: GameRules): Promise<string> {
  const level = CONFIG.levels.find((candidate) => candidate.id === board.id);
  const payload = JSON.stringify({
    policy: "per-hunt-difficulty-v3",
    geography: [board.land, board.regions, board.borders, board.nodes, board.links],
    rules: { squadCount: rules.squadCount, maxOrders: rules.maxOrders, runnerSpeedKmh: rules.runnerSpeedKmh, squadSpeedKmh: rules.squadSpeedKmh, minimumRunnerTravelFraction: rules.minimumRunnerTravelFraction },
    smoothing: CONFIG.movement.routeSmoothing,
    runnerRouting: { visibleLandStarts: CONFIG.movement.runnerRouting.visibleLandStarts, visibleCrossingsPerBorder: CONFIG.movement.runnerRouting.visibleCrossingsPerBorder },
    arrivalToleranceKm: CONFIG.movement.arrivalToleranceKm,
    progression: CONFIG.progression,
    curation: setupCuration(board.id),
    difficultyBand: level?.escapePressureRange,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The lower bound is proved separately by exhausting every shorter sequence.
 * A longer witness proves playability, not an exact minimum equal to its length. */
export function measureDifficulty(board: CountryBoard, setup: StartingSetup, rules: GameRules, navigation: Navigation, rulesSignature: string, challenge: ChallengePolicy = policyForSetup(board, setup)): NonNullable<StartingSetup["difficulty"]> {
  const game = new PatrolGame(board, setup, rules, navigation);
  const escapePressure = Math.min(1, game.minimumRunnerTravelKm / Math.max(CONFIG.movement.arrivalToleranceKm, game.runnerEscapeDistanceKm));
  for (const order of setup.witness) { game.issueOrder(order.squad, order.border); game.resolveOrder(); }
  const placement = placementDifficulty(game);
  const weights = CONFIG.progression.weights;
  const score = challenge.minimumOrders * weights.minimumOrders + (setup.witness.length - challenge.minimumOrders) * weights.extraSolutionMove + placement.meanSquadTravelKm / countryScaleKm(board.land) * weights.travelFraction + (1 - placement.initiallyGuardedFraction) * weights.unguardedFraction + escapePressure * weights.escapePressure;
  return { minimumOrders: challenge.minimumOrders, solutionOrders: setup.witness.length, ...placement, escapePressure, score, rulesSignature };
}
