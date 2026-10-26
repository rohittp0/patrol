import { distanceKm } from "./navigation";
import type { PatrolGame, Outcome } from "./engine";
import type { Position } from "./types";
export interface OrderForecast {
  squadPath: Position[];
  runnerPath: Position[];
  durationHours: number;
  arrivalHours: number;
  runnerDistanceKm: number;
  outcome: Outcome;
}
/** Run the real simulation on a detached branch, splitting at every runner
 * waypoint and arrival. Includes closure-induced turns, travel floors, firing,
 * escape and temporary guard expiry. Never guesses a straight-line endpoint. */
export function forecastOrder(
  game: PatrolGame,
  squad: number,
  border: number,
): OrderForecast | null {
  const branch = game.fork();
  if (!branch.issueOrder(squad, border)) return null;
  const order = branch.history.at(-1)!;
  const runnerPath: Position[] = [[...branch.runner.position]];
  while (branch.activeOrder && branch.outcome.kind === "playing") {
    const active = branch.activeOrder;
    const waypoint = branch.runner.route[0];
    const nextTurn = waypoint
      ? distanceKm(branch.runner.position, waypoint.position) /
        branch.rules.runnerSpeedKmh
      : Infinity;
    const arrival =
      branch.squads[squad].border === null
        ? active.squadArrivalHours - active.elapsedHours
        : Infinity;
    const end = active.durationHours - active.elapsedHours;
    // Tiny epsilon lets the engine consume coincident zero-length waypoints.
    branch.advanceHours(Math.max(1e-9, Math.min(nextTurn, arrival, end)));
    const point: Position = [...branch.runner.position];
    if (distanceKm(runnerPath.at(-1)!, point) > 1e-8) runnerPath.push(point);
  }
  return {
    squadPath: order.path,
    runnerPath,
    durationHours: order.durationHours,
    arrivalHours: order.squadArrivalHours,
    runnerDistanceKm: order.runnerTravelledKm,
    outcome: branch.outcome,
  };
}
