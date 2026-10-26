import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import boardJson from "../../public/data/india.json";
import campaignJson from "../../public/data/india-campaign.json";
import {
  applyAction,
  ECONOMY,
  awardWin,
  newPlayer,
  settleTraining,
  type PlayerAction,
  type PlayerState,
} from "../../src/game/collection";
import {
  createMission,
  type Mission,
  type MissionAttempt,
} from "../../src/game/missions";
import { PatrolGame } from "../../src/game/engine";
import { Navigation } from "../../src/game/navigation";
import type { CountryBoard } from "../../src/game/types";

initializeApp();
const db = getFirestore();
const board = boardJson as unknown as CountryBoard;
const levels = campaignJson.levels as Mission[];
const navigation = new Navigation(board);
interface Stored {
  player: PlayerState;
  active: MissionAttempt | null;
  pendingHours: number | null;
}
const idPattern = /^[\w-]{10,80}$/;
function checkedGame(
  active: MissionAttempt,
  moves: MissionAttempt["moves"],
  pendingHours: number | null = null,
) {
  if (!Array.isArray(moves) || moves.length > ECONOMY.maxMoves)
    throw new Error("Invalid move log");
  const game = new PatrolGame(board, active.setup, active.rules, navigation);
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (
      !move ||
      !Number.isInteger(move.squad) ||
      !Number.isInteger(move.border) ||
      !game.issueOrder(move.squad, move.border)
    )
      throw new Error("Invalid move");
    if (i === moves.length - 1 && pendingHours !== null) {
      if (
        !Number.isFinite(pendingHours) ||
        pendingHours < 0 ||
        pendingHours > game.activeOrder!.durationHours
      )
        throw new Error("Invalid clock");
      game.advanceHours(pendingHours);
    } else game.resolveOrder();
  }
  return game;
}

/** The browser submits commands, never balances, prices, stats or completion dates. */
export const patrol = onCall(
  {
    region: "asia-south1",
    maxInstances: 3,
    memory: "512MiB",
    timeoutSeconds: 60,
    cors: [
      "https://patrol.rohittp.com",
      "https://patrol-daac9.web.app",
      "https://patrol-daac9.firebaseapp.com",
      /^https:\/\/patrol-daac9--[\w-]+\.web\.app$/,
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    ],
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Sign-in session required");
    const input = request.data;
    if (
      !input ||
      typeof input.op !== "string" ||
      typeof input.actionId !== "string" ||
      !idPattern.test(input.actionId)
    )
      throw new HttpsError("invalid-argument", "Invalid request");
    const ref = db.doc(`players/${request.auth.uid}`),
      receipt = ref.collection("receipts").doc(input.actionId);
    try {
      return await db.runTransaction(async (tx) => {
        const [snapshot, prior] = await Promise.all([
          tx.get(ref),
          tx.get(receipt),
        ]);
        if (prior.exists)
          return { ...prior.data()!.result, serverNow: Date.now() };
        const stored: Stored = snapshot.exists
          ? (snapshot.data() as Stored)
          : { player: newPlayer(), active: null, pendingHours: null };
        const now = Date.now();
        stored.player = settleTraining(stored.player, now);
        if (input.op !== "load" && input.revision !== stored.player.revision)
          throw new HttpsError(
            "aborted",
            "Progress changed on another device. Reload to continue.",
          );
        let reward = 0;
        if (input.op === "action") {
          const action = input.action as PlayerAction;
          if (
            action?.kind === "train" &&
            stored.active?.selection.includes(action.squad)
          )
            throw new Error(
              "Finish or abandon the current level before training a deployed squad",
            );
          stored.player = applyAction(stored.player, action, now);
        } else if (input.op === "start") {
          const mission = levels.find((level) => level.number === input.level);
          if (!mission) throw new Error("Unknown level");
          const { setup, rules, steps, game } = createMission(
            board,
            mission,
            stored.player,
            input.selection,
            now,
            navigation,
          );
          if (game.outcome.kind !== "playing")
            throw new Error(
              "This roster wins before the first move; choose another roster",
            );
          stored.active = {
            id: randomUUID(),
            level: mission.number,
            selection: input.selection,
            steps,
            setup,
            rules,
            moves: [],
          };
          stored.pendingHours = null;
          stored.player.selection = input.selection;
          stored.player.revision++;
        } else if (input.op === "save" || input.op === "finish") {
          if (!stored.active || stored.active.id !== input.attemptId)
            throw new Error("Level attempt is no longer active");
          const moves = input.moves as MissionAttempt["moves"];
          if (
            !Array.isArray(moves) ||
            moves.length < stored.active.moves.length ||
            JSON.stringify(moves.slice(0, stored.active.moves.length)) !==
              JSON.stringify(stored.active.moves)
          )
            throw new Error("Stale move log");
          const pending =
            input.op === "finish" ? null : (input.pendingHours ?? null);
          if (
            moves.length === stored.active.moves.length &&
            stored.pendingHours !== null &&
            pending !== null &&
            pending < stored.pendingHours
          )
            throw new Error("Stale move clock");
          const game = checkedGame(stored.active, moves, pending);
          if (input.op === "finish") {
            if (!game.won)
              throw new Error("Winning result could not be verified");
            const award = awardWin(
              stored.player,
              stored.active.level,
              game.ordersUsed,
            );
            stored.player = award.player;
            reward = award.reward;
            stored.active = null;
            stored.pendingHours = null;
          } else {
            stored.active.moves = moves;
            stored.pendingHours = pending;
            stored.player.revision++;
          }
        } else if (input.op === "abandon") {
          stored.active = null;
          stored.pendingHours = null;
          stored.player.revision++;
        } else if (input.op !== "load") throw new Error("Unknown operation");
        const result = { ...stored, reward, serverNow: now };
        tx.set(ref, stored);
        // Reads need no receipt, avoiding a growing document set on every refresh.
        if (input.op !== "load") tx.set(receipt, { result, createdAt: now });
        return result;
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "failed-precondition",
        error instanceof Error ? error.message : "Operation failed",
      );
    }
  },
);
