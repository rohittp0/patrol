import type { PatrolGame } from "./engine";
import { caseForChallenge, type CaseFile } from "./case-files";
import { LandRoute } from "./land-route";

export interface CaptureReport { file: CaseFile; country: string; countryId: string; region: string; moves: number; squads: number; score: number; hunt: number }

/** Use the actual final geographic point, not the starting region or witness. */
export function captureRegion(game: PatrolGame): string {
  const names = [...new Set(game.board.regions.filter((region) => new LandRoute(region.geometry).contains(game.runner.position)).map((region) => region.name))];
  if (names.length) return names.length === 1 ? names[0] : `${names.join("–")} border`;
  const id = game.board.nodes[game.runner.lastLandNode].region;
  return game.board.regions.find((region) => region.id === id)?.name ?? game.board.name;
}

export function captureReport(game: PatrolGame, challenge: number, hunt: number): CaptureReport {
  if (game.outcome.kind !== "won") throw new Error("Only completed captures can make headlines");
  return { file: caseForChallenge(game.board.id, challenge), country: game.board.name, countryId: game.board.id, region: captureRegion(game), moves: game.ordersUsed, squads: game.squads.length, score: game.outcome.score, hunt };
}
