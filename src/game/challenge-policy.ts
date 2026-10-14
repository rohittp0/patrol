import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import type { CountryBoard, StartingSetup } from "./types";

export type ChallengePolicy = typeof CONFIG.progression.introductory | typeof CONFIG.progression.main;

export function challengePolicy(index: number): ChallengePolicy {
  if (!Number.isInteger(index) || index < 0 || index >= CONFIG.setups.poolSize) throw new Error("Invalid hunt index");
  return index < CONFIG.progression.introductoryHunts ? CONFIG.progression.introductory : CONFIG.progression.main;
}

export function policyForSetup(board: CountryBoard, setup: StartingSetup): ChallengePolicy {
  const index = board.setups.findIndex((entry) => entry.id === setup.id);
  return index >= 0 ? challengePolicy(index) : setup.difficulty?.minimumOrders === CONFIG.progression.main.minimumOrders ? CONFIG.progression.main : CONFIG.progression.introductory;
}
