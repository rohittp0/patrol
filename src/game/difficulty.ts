import { PatrolGame, type GameRules } from "./engine";
import { distanceKm, Navigation } from "./navigation";
import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import { hasWinWithin } from "./setup-validation";
import type { CountryBoard, StartingSetup } from "./types";

/** Bind offline difficulty proofs to exact geography, movement rules and policy. */
export async function setupRulesSignature(board: CountryBoard, rules: GameRules): Promise<string> {
  const level = CONFIG.levels.find((candidate) => candidate.id === board.id);
  const payload = JSON.stringify({
    policy: "arrival-deadlines-with-runner-floor-v1",
    geography: [board.land, board.borders, board.nodes, board.links],
    rules: { squadCount: rules.squadCount, maxOrders: rules.maxOrders, runnerSpeedKmh: rules.runnerSpeedKmh, squadSpeedKmh: rules.squadSpeedKmh, minimumRunnerTravelFraction: rules.minimumRunnerTravelFraction },
    smoothing: CONFIG.movement.routeSmoothing,
    arrivalToleranceKm: CONFIG.movement.arrivalToleranceKm,
    progression: CONFIG.progression,
    difficultyBand: level && { solutionOrders: level.solutionOrders, escapePressureRange: level.escapePressureRange },
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Shorter minimum solutions rank first; opening choice and pressure break ties.
 * Opening breadth is an explicitly sampled metric, not an exhaustive count.
 */
export function measureDifficulty(board: CountryBoard, setup: StartingSetup, rules: GameRules, navigation: Navigation, rulesSignature: string): NonNullable<StartingSetup["difficulty"]> {
  const game = new PatrolGame(board, setup, rules, navigation);
  const minimumOrders = setup.witness.length;
  const openings: { squad: number; border: number; distance: number }[] = [];
  game.squads.forEach((squad, index) => board.borders.forEach((border, destination) => {
    if (!game.securedBorders.has(destination)) openings.push({ squad: index, border: destination, distance: distanceKm(squad.actor.position, border.post) });
  }));
  openings.sort((a, b) => a.distance - b.distance || a.squad - b.squad || a.border - b.border);
  const probes = openings.slice(0, CONFIG.progression.openingProbeCount);
  const known = setup.witness[0];
  if (!probes.some((order) => order.squad === known.squad && order.border === known.border)) probes.push({ ...known, distance: 0 });
  let winningOpenings = 0;
  for (const opening of probes) {
    const branch = game.fork();
    if (!branch.issueOrder(opening.squad, opening.border)) continue;
    branch.resolveOrder();
    if (hasWinWithin(branch, minimumOrders - 1)) winningOpenings++;
  }
  const escape = navigation.shortestPath([{ node: setup.runnerNode, cost: 0 }], (node) => board.nodes[node].kind === "exit", game.securedBorders, true);
  const escapePressure = Math.min(1, game.minimumRunnerTravelKm / Math.max(CONFIG.movement.arrivalToleranceKm, escape?.distanceKm ?? 0));
  const weights = CONFIG.progression.weights;
  const score = minimumOrders * weights.minimumOrders + (1 - winningOpenings / probes.length) * weights.openingScarcity + escapePressure * weights.escapePressure;
  return { minimumOrders, winningOpenings, testedOpenings: probes.length, escapePressure, score, rulesSignature };
}
