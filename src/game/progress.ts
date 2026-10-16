import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import { PatrolGame, type GameRules, type GameSnapshot } from "./engine";
import type { Navigation } from "./navigation";
import type { CountryBoard, StartingSetup } from "./types";

const KEY = "patrol:progress:v1";
type StoragePort = Pick<Storage, "getItem" | "setItem">;
export interface SavedProgress {
  version: 1;
  country: string;
  huntIndex: number;
  setupId: string;
  setupKey: string;
  signature: string;
  state: GameSnapshot;
  attempt: { id: string; elapsedMs: number; hintsUsed: number; ended: boolean };
  selectedPost: number | null;
  focusedSquad: number | null;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown): value is number => finite(value) && Number.isInteger(value) && value >= 0;
const position = (value: unknown) => Array.isArray(value) && value.length === 2 && value.every(finite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
export const setupKey = (setup: StartingSetup) => JSON.stringify([setup.runnerNode, setup.squadBorders, setup.witness]);

export function readProgress(storage: StoragePort): SavedProgress | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(KEY) ?? "null");
    if (!record(value) || value.version !== 1 || !CONFIG.levels.some((level) => level.id === value.country) || !integer(value.huntIndex) || value.huntIndex >= CONFIG.setups.poolSize || typeof value.setupId !== "string" || typeof value.setupKey !== "string" || typeof value.signature !== "string" || !record(value.state) || !record(value.attempt) || typeof value.attempt.id !== "string" || !finite(value.attempt.elapsedMs) || value.attempt.elapsedMs < 0 || !integer(value.attempt.hintsUsed) || typeof value.attempt.ended !== "boolean" || !(value.selectedPost === null || integer(value.selectedPost)) || !(value.focusedSquad === null || integer(value.focusedSquad))) return null;
    return value as unknown as SavedProgress;
  } catch { return null; }
}

export function writeProgress(storage: StoragePort, progress: SavedProgress): boolean {
  try { storage.setItem(KEY, JSON.stringify(progress)); return true; } catch { return false; }
}

/** Persisted JSON has no shared object references. Validate it against the
 * current board before restoring route nodes, squads or in-progress clocks. */
function validSnapshot(value: unknown, board: CountryBoard, rules: GameRules): value is GameSnapshot {
  const node = (n: unknown) => integer(n) && !!board.nodes[n];
  const border = (n: unknown) => integer(n) && !!board.borders[n];
  const waypoint = (point: unknown) => record(point) && (point.node === null || node(point.node)) && position(point.position) && (point.landNode === undefined || node(point.landNode) && board.nodes[point.landNode as number].kind === "land");
  const actor = (a: unknown, runner: boolean) => record(a) && position(a.position) && (a.atNode === null || node(a.atNode)) && node(a.lastLandNode) && (!runner || board.nodes[a.lastLandNode as number].kind === "land") && (a.edge === null || Array.isArray(a.edge) && a.edge.length === 2 && a.edge.every(node)) && Array.isArray(a.route) && a.route.every(waypoint) && (a.segment === null || record(a.segment) && position(a.segment.start) && waypoint(a.segment.target) && finite(a.segment.length) && a.segment.length >= 0 && finite(a.segment.travelled) && a.segment.travelled >= 0 && a.segment.travelled <= a.segment.length);
  const order = (o: unknown) => record(o) && integer(o.squad) && o.squad < rules.squadCount && border(o.from) && border(o.to) && [o.distanceKm, o.durationHours, o.squadArrivalHours, o.runnerTravelledKm, o.elapsedHours].every((n) => finite(n) && n >= 0) && (o.elapsedHours as number) <= (o.durationHours as number) && (o.squadArrivalHours as number) <= (o.durationHours as number) && Array.isArray(o.path) && o.path.every(position);
  if (!record(value) || !actor(value.runner, true) || !Array.isArray(value.squads) || value.squads.length !== rules.squadCount || !value.squads.every((squad) => record(squad) && (squad.border === null || border(squad.border)) && actor(squad.actor, false)) || !integer(value.ordersUsed) || value.ordersUsed > rules.maxOrders || !Array.isArray(value.history) || value.history.length !== value.ordersUsed || !value.history.every(order) || !(value.activeOrder === null || order(value.activeOrder)) || !record(value.outcome)) return false;
  if (value.activeOrder !== null && (value.ordersUsed === 0 || JSON.stringify(value.activeOrder) !== JSON.stringify(value.history.at(-1)))) return false;
  const guards = value.squads.flatMap((squad) => squad.border === null ? [] : [squad.border]);
  if (new Set(guards).size !== guards.length || value.squads.filter((squad) => squad.border === null).length > (value.activeOrder === null ? 0 : 1)) return false;
  return value.outcome.kind === "playing" || value.outcome.kind === "won" && value.outcome.score === rules.maxOrders - value.ordersUsed || value.outcome.kind === "lost" && ["budget", "escape"].includes(value.outcome.reason as string);
}

export function restoreProgress(saved: SavedProgress, board: CountryBoard, setup: StartingSetup, rules: GameRules, navigation?: Navigation): PatrolGame | null {
  if (saved.country !== board.id || saved.setupId !== setup.id || saved.setupKey !== setupKey(setup) || saved.signature !== setup.difficulty?.rulesSignature || !validSnapshot(saved.state, board, rules)) return null;
  try { return PatrolGame.fromSnapshot(board, setup, rules, saved.state, navigation); } catch { return null; }
}

export function previousHunt(country: string, huntIndex: number, countries: readonly string[] = CONFIG.levels.map((level) => level.id)): { country: string; huntIndex: number } | null {
  const countryIndex = countries.indexOf(country);
  if (countryIndex < 0 || !integer(huntIndex) || huntIndex >= CONFIG.setups.poolSize) return null;
  if (huntIndex > 0) return { country, huntIndex: huntIndex - 1 };
  return countryIndex > 0 ? { country: countries[countryIndex - 1], huntIndex: CONFIG.setups.poolSize - 1 } : null;
}
