import { PatrolGame, type GameRules } from "./engine";
import {
  ECONOMY,
  readySquad,
  statsFor,
  validateSelection,
  type PlayerState,
  type SquadId,
} from "./collection";
import type { CountryBoard, StartingSetup } from "./types";
import type { Navigation } from "./navigation";

export interface Mission {
  country?: string;
  number: number;
  id: string;
  title: string;
  briefing: string;
  runnerNode: number;
  posts: number[];
  runnerSpeed: number;
  recommended: { id: SquadId; step: number }[];
  witness: { squad: number; border: number }[];
  verification?: {
    moves: number;
    basicWitnessWins: boolean;
    weakerWitnessMoves: number | null;
  };
}
export interface MissionAttempt {
  country?: string;
  id: string;
  level: number;
  selection: (SquadId | null)[];
  steps: number[];
  setup: StartingSetup;
  rules: GameRules;
  moves: { squad: number; border: number }[];
}
export function createMission(
  board: CountryBoard,
  mission: Mission,
  state: PlayerState,
  selection: (SquadId | null)[],
  now: number,
  navigation?: Navigation,
) {
  if (mission.country && mission.country !== board.id) throw new Error("Level belongs to another country");
  validateSelection(state, selection, now);
  if (mission.number > state.unlocked) throw new Error("Level is locked");
  const selected = selection.flatMap((id, slot) =>
    id === null ? [] : [{ id, slot }],
  );
  const steps = selected.map(({ id }) => {
    if (!readySquad(state, id, now)) throw new Error("Squad is training");
    const unit = state.squads[id]!;
    return unit.training && unit.training.readyAt <= now
      ? unit.training.step
      : unit.step;
  });
  const units = selected.map(({ id }, index) => statsFor(id, steps[index]));
  const setup: StartingSetup = {
    id: mission.id,
    runnerNode: mission.runnerNode,
    squadBorders: selected.map(({ slot }, index) =>
      units[index].kind === "helicopter" ? -1 : mission.posts[slot],
    ),
    witness: mission.witness,
  };
  const rules: GameRules = {
    squadCount: units.length,
    maxOrders: ECONOMY.maxMoves,
    runnerSpeedKmh: mission.runnerSpeed,
    squadSpeedKmh: ECONOMY.patrolSpeedKmh,
    minimumRunnerTravelFraction: ECONOMY.travelFloorFraction,
    units,
  };
  return {
    game: new PatrolGame(board, setup, rules, navigation),
    steps,
    setup,
    rules,
  };
}
export function replayAttempt(
  board: CountryBoard,
  attempt: Pick<MissionAttempt, "setup" | "rules" | "moves">,
  navigation?: Navigation,
) {
  if (
    !Array.isArray(attempt.moves) ||
    attempt.moves.length === 0 ||
    attempt.moves.length > ECONOMY.maxMoves
  )
    throw new Error("Invalid move log");
  const game = new PatrolGame(board, attempt.setup, attempt.rules, navigation);
  if (game.outcome.kind !== "playing")
    throw new Error("Invalid starting setup");
  for (const move of attempt.moves) {
    if (
      !Number.isInteger(move.squad) ||
      !Number.isInteger(move.border) ||
      !game.issueOrder(move.squad, move.border)
    )
      throw new Error("Invalid move");
    game.resolveOrder();
  }
  return game;
}
