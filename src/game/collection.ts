import { PLAYTEST_CONFIG } from "./playtest.config";
import type { UnitStats } from "./engine";

export const ECONOMY = PLAYTEST_CONFIG.progressionV2;
export type Specialist = keyof typeof ECONOMY.catalog;
export type SquadId = "patrol-1" | "patrol-2" | "patrol-3" | Specialist;
export const INITIAL_SQUADS: SquadId[] = ["patrol-1", "patrol-2", "patrol-3"];
export interface OwnedSquad {
  step: number;
  training: { step: number; readyAt: number } | null;
}
export interface LevelResult {
  bestMoves: number;
  paid: number;
}
export interface PlayerState {
  version: 2;
  revision: number;
  wallet: number;
  unlocked: number;
  squads: Partial<Record<SquadId, OwnedSquad>>;
  results: Record<string, LevelResult>;
  selection: (SquadId | null)[];
  loginPrompted: boolean;
  firstPurchase: boolean;
  /** Optional for saves made before the action-guided tutorials. */
  tutorials?: { field: boolean; academy: boolean };
}
export function newPlayer(): PlayerState {
  return {
    version: 2,
    revision: 0,
    wallet: 0,
    unlocked: 1,
    squads: Object.fromEntries(
      INITIAL_SQUADS.map((id) => [id, { step: 0, training: null }]),
    ),
    results: {},
    selection: [...INITIAL_SQUADS],
    loginPrompted: false,
    firstPurchase: false,
    tutorials: { field: false, academy: false },
  };
}
export const squadName = (id: SquadId) =>
  id.startsWith("patrol-")
    ? `Patrol Squad ${id.slice(-1)}`
    : ECONOMY.catalog[id as Specialist].name;
export const squadSymbol = (id: SquadId) =>
  id.startsWith("patrol-") ? "◆" : ECONOMY.catalog[id as Specialist].symbol;
export const isSpecialist = (id: string): id is Specialist =>
  Object.hasOwn(ECONOMY.catalog, id);
export function readySquad(state: PlayerState, id: SquadId, now: number) {
  if (!Object.hasOwn(state.squads, id)) return false;
  const unit = state.squads[id];
  return !!unit && (!unit.training || unit.training.readyAt <= now);
}
export function settleTraining(state: PlayerState, now: number): PlayerState {
  const next = structuredClone(state);
  for (const unit of Object.values(next.squads))
    if (unit?.training && unit.training.readyAt <= now) {
      unit.step = unit.training.step;
      unit.training = null;
    }
  return next;
}
export function statsFor(id: SquadId, step: number): UnitStats {
  if (!Number.isInteger(step) || step < 0 || step > ECONOMY.upgradeCosts.length)
    throw new Error("Invalid upgrade step");
  return {
    kind: isSpecialist(id) ? id : "patrol",
    speed: id === "rapid" ? ECONOMY.rapidSpeeds[step] : ECONOMY.patrolSpeedKmh,
    deploymentHours: ECONOMY.helicopterHours[step],
    guardMoves: ECONOMY.helicopterGuardMoves[step],
    radiusKm: id === "marksman" ? ECONOMY.marksmanRadiusKm[step] : 0,
  };
}
export function rewardFor(level: number, moves: number) {
  if (
    !Number.isInteger(level) ||
    level < 1 ||
    level > ECONOMY.levelCount ||
    !Number.isInteger(moves) ||
    moves < 1 ||
    moves > ECONOMY.maxMoves
  )
    throw new Error("Invalid level result");
  return (
    (ECONOMY.baseReward + (level - 1) * ECONOMY.rewardStep) *
    (moves < 3 ? 3 : moves <= 5 ? 2 : 1)
  );
}
export type PlayerAction =
  | { kind: "purchase"; squad: Specialist }
  | { kind: "train"; squad: Specialist }
  | { kind: "selection"; selection: (SquadId | null)[] }
  | { kind: "prompt" }
  | { kind: "tutorial"; lesson: "field" | "academy" };
/** Browser game transition with an explicit clock for training and repeatable tests. */
export function applyAction(
  current: PlayerState,
  action: PlayerAction,
  now: number,
): PlayerState {
  const next = settleTraining(current, now);
  if (action.kind === "purchase") {
    if (!isSpecialist(action.squad)) throw new Error("Unknown squad");
    const item = ECONOMY.catalog[action.squad];
    if (next.squads[action.squad]) throw new Error("Already owned");
    if (next.unlocked < item.unlock)
      throw new Error(`Available at Level ${item.unlock}`);
    if (next.wallet < item.price) throw new Error("Not enough money");
    next.wallet -= item.price;
    next.squads[action.squad] = { step: 0, training: null };
    next.firstPurchase = true;
  } else if (action.kind === "train") {
    if (!isSpecialist(action.squad)) throw new Error("Unknown squad");
    const unit = next.squads[action.squad];
    if (!unit || unit.training || unit.step >= ECONOMY.upgradeCosts.length)
      throw new Error("Squad cannot start training");
    const cost = ECONOMY.upgradeCosts[unit.step];
    if (next.wallet < cost) throw new Error("Not enough money");
    next.wallet -= cost;
    unit.training = {
      step: unit.step + 1,
      readyAt: now + ECONOMY.trainingSeconds[unit.step] * 1000,
    };
  } else if (action.kind === "selection") {
    validateSelection(next, action.selection, now);
    next.selection = [...action.selection];
  } else if (action.kind === "tutorial") {
    next.tutorials = {
      field: !!next.tutorials?.field,
      academy: !!next.tutorials?.academy,
    };
    next.tutorials[action.lesson] = true;
  } else if (action.kind === "prompt") next.loginPrompted = true;
  else throw new Error("Unknown action");
  next.revision++;
  return next;
}
export function validateSelection(
  state: PlayerState,
  selection: (SquadId | null)[],
  now: number,
) {
  if (!Array.isArray(selection) || selection.length !== ECONOMY.slots)
    throw new Error("Invalid roster");
  const ids = selection.filter((id): id is SquadId => id !== null);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !readySquad(state, id, now))
  )
    throw new Error("Squad is unavailable");
}
export function awardWin(
  current: PlayerState,
  level: number,
  moves: number,
): { player: PlayerState; reward: number } {
  if (level > current.unlocked) throw new Error("Level is locked");
  const possible = rewardFor(level, moves),
    previous = current.results[String(level)];
  const improved = !previous || moves < previous.bestMoves;
  const reward = improved ? Math.max(0, possible - (previous?.paid ?? 0)) : 0;
  const next = structuredClone(current);
  if (improved)
    next.results[String(level)] = {
      bestMoves: moves,
      paid: Math.max(previous?.paid ?? 0, possible),
    };
  next.wallet += reward;
  next.unlocked = Math.max(
    next.unlocked,
    Math.min(ECONOMY.levelCount, level + 1),
  );
  next.revision++;
  return { player: next, reward };
}
