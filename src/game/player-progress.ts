import { PatrolGame } from "./engine";
import {
  ECONOMY,
  applyAction,
  awardWin,
  newPlayer,
  settleTraining,
  type PlayerAction,
  type PlayerState,
  type SquadId,
} from "./collection";
import { createMission, type Mission, type MissionAttempt } from "./missions";
import type { CountryBoard } from "./types";
import type { Navigation } from "./navigation";

export interface PlayerProgress {
  player: PlayerState;
  active: MissionAttempt | null;
  pendingHours: number | null;
  reward: number;
}
export interface ProgressMutation {
  actionId: string;
  revision: number;
  op: "action" | "start" | "save" | "finish" | "abandon";
  action?: PlayerAction;
  level?: number;
  selection?: (SquadId | null)[];
  attemptId?: string;
  moves?: MissionAttempt["moves"];
  pendingHours?: number | null;
}
export const initialProgress = (): PlayerProgress => ({
  player: newPlayer(),
  active: null,
  pendingHours: null,
  reward: 0,
});

/** Ordinary game validation runs in the player's browser, not an anti-cheat server. */
export function advanceProgress(
  current: PlayerProgress,
  change: ProgressMutation,
  board: CountryBoard,
  levels: Mission[],
  now: number,
  navigation?: Navigation,
): PlayerProgress {
  const next = structuredClone(current);
  next.player = settleTraining(next.player, now);
  next.reward = 0;
  if (change.op === "action") {
    if (!change.action) throw new Error("Missing action");
    if (
      change.action.kind === "train" &&
      next.active?.selection.includes(change.action.squad)
    )
      throw new Error(
        "Finish or abandon the saved level before training a deployed squad",
      );
    next.player = applyAction(next.player, change.action, now);
  } else if (change.op === "start") {
    const mission = levels.find((level) => level.number === change.level);
    if (!mission || !change.selection)
      throw new Error("Unknown level or roster");
    const { setup, rules, steps, game } = createMission(
      board,
      mission,
      next.player,
      change.selection,
      now,
      navigation,
    );
    if (game.outcome.kind !== "playing")
      throw new Error("Choose another starting roster");
    next.active = {
      id: crypto.randomUUID(),
      level: mission.number,
      selection: [...change.selection],
      setup,
      rules,
      steps,
      moves: [],
    };
    next.pendingHours = null;
    next.player.selection = [...change.selection];
    next.player.revision++;
  } else if (change.op === "save" || change.op === "finish") {
    const active = next.active;
    if (!active || active.id !== change.attemptId)
      throw new Error("This level attempt is no longer active");
    const moves = change.moves;
    if (
      !Array.isArray(moves) ||
      moves.length > ECONOMY.maxMoves ||
      moves.length < active.moves.length ||
      JSON.stringify(moves.slice(0, active.moves.length)) !==
        JSON.stringify(active.moves)
    )
      throw new Error("Move history no longer matches this save");
    const pending =
      change.op === "finish" ? null : (change.pendingHours ?? null);
    if (
      moves.length === active.moves.length &&
      pending !== null &&
      (next.pendingHours === null || pending < next.pendingHours)
    )
      throw new Error("A newer move checkpoint is already saved");
    const game = new PatrolGame(board, active.setup, active.rules, navigation);
    for (let index = 0; index < moves.length; index++) {
      const move = moves[index];
      if (
        !move ||
        !Number.isInteger(move.squad) ||
        !Number.isInteger(move.border) ||
        !game.issueOrder(move.squad, move.border)
      )
        throw new Error("Invalid move");
      if (index === moves.length - 1 && pending !== null) {
        if (
          !Number.isFinite(pending) ||
          pending < 0 ||
          !game.activeOrder ||
          pending > game.activeOrder.durationHours
        )
          throw new Error("Invalid move checkpoint");
        game.advanceHours(pending);
      } else game.resolveOrder();
    }
    if (pending !== null && moves.length === 0)
      throw new Error("No move to checkpoint");
    if (change.op === "finish") {
      if (!game.won)
        throw new Error("Complete the level before claiming its reward");
      const awarded = awardWin(next.player, active.level, game.ordersUsed);
      next.player = awarded.player;
      next.reward = awarded.reward;
      next.active = null;
      next.pendingHours = null;
    } else {
      active.moves = structuredClone(moves);
      next.pendingHours = pending;
      next.player.revision++;
    }
  } else if (change.op === "abandon") {
    next.active = null;
    next.pendingHours = null;
    next.player.revision++;
  } else throw new Error("Unknown progress action");
  return next;
}
