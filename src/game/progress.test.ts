import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PatrolGame, rulesForLevel } from "./engine";
import { Navigation, distanceKm } from "./navigation";
import { previousHunt, readProgress, restoreProgress, setupKey, writeProgress, type SavedProgress } from "./progress";
import type { CountryBoard } from "./types";

const board: CountryBoard = JSON.parse(readFileSync("public/data/usa.json", "utf8"));
const setup = board.setups[0], rules = rulesForLevel("usa");
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
function save(game: PatrolGame): SavedProgress {
  return { version: 1, country: game.board.id, huntIndex: 0, setupId: game.setup.id, setupKey: setupKey(game.setup), signature: game.setup.difficulty!.rulesSignature, state: game.snapshot(), attempt: { id: "test-attempt", elapsedMs: 1234, hintsUsed: 2, ended: game.outcome.kind !== "playing" }, selectedPost: null, focusedSquad: null };
}

test("JSON progress resumes the exact mid-move clock and reconnects actor/history references", () => {
  const navigation = new Navigation(board), original = new PatrolGame(board, setup, rules, navigation);
  const move = setup.witness[0];
  assert(original.issueOrder(move.squad, move.border));
  original.advanceHours(original.activeOrder!.durationHours * 0.37);
  assert(original.activeOrder && original.outcome.kind === "playing");
  const store = storage(); assert(writeProgress(store, save(original)));
  const saved = readProgress(store)!; const resumed = restoreProgress(saved, board, setup, rules, navigation)!;
  assert(resumed);
  assert.deepEqual(resumed.snapshot(), original.snapshot());
  if (resumed.runner.segment) assert.equal(resumed.runner.segment.target, resumed.runner.route[0]);
  assert.equal(resumed.activeOrder, resumed.history.at(-1));
  original.resolveOrder(); resumed.resolveOrder();
  assert.deepEqual(resumed.outcome, original.outcome);
  assert.deepEqual(resumed.history, original.history);
  assert(distanceKm(resumed.runner.position, original.runner.position) < 0.000001);
  assert.deepEqual(resumed.squads.map((squad) => squad.border), original.squads.map((squad) => squad.border));
});

test("a completed chase survives JSON storage without becoming a fresh hunt", () => {
  const game = new PatrolGame(board, setup, rules);
  for (const move of setup.witness) { game.issueOrder(move.squad, move.border); game.resolveOrder(); }
  assert(game.won);
  const store = storage(); assert(writeProgress(store, save(game)));
  const saved = readProgress(store)!; assert(saved.attempt.ended);
  const resumed = restoreProgress(saved, board, setup, rules)!;
  assert.deepEqual(resumed.outcome, game.outcome); assert.equal(resumed.ordersUsed, game.ordersUsed);
});

test("changed rules, replaced setups and damaged route nodes are rejected safely", () => {
  const game = new PatrolGame(board, setup, rules);
  const saved = save(game);
  assert.equal(restoreProgress({ ...saved, signature: "old-rules" }, board, setup, rules), null);
  assert.equal(restoreProgress(saved, board, { ...setup, runnerNode: setup.runnerNode + 1 }, rules), null);
  const broken = structuredClone(saved); broken.state.runner.lastLandNode = board.nodes.length;
  assert.equal(restoreProgress(broken, board, setup, rules), null);
  const invalid = storage(); invalid.setItem("patrol:progress:v1", "{broken"); assert.equal(readProgress(invalid), null);
  assert.equal(readProgress({ getItem: () => { throw Error("blocked"); }, setItem() {} }), null);
  assert.equal(writeProgress({ getItem: () => null, setItem: () => { throw Error("full"); } }, saved), false);
});

test("Previous hunt is disabled only at the campaign start and crosses country boundaries", () => {
  assert.equal(previousHunt("usa", 0), null);
  assert.deepEqual(previousHunt("usa", 1), { country: "usa", huntIndex: 0 });
  assert.deepEqual(previousHunt("india", 0), { country: "usa", huntIndex: 5 });
  assert.deepEqual(previousHunt("hungary", 0), { country: "india", huntIndex: 5 });
  assert.equal(previousHunt("missing", 0), null);
  const indiaFirst = ["india", "usa", "hungary"];
  assert.equal(previousHunt("india", 0, indiaFirst), null);
  assert.deepEqual(previousHunt("usa", 0, indiaFirst), {country:"india", huntIndex:5});
  const hungaryFirst = ["hungary", "usa", "india"];
  assert.equal(previousHunt("hungary", 0, hungaryFirst), null);
  assert.deepEqual(previousHunt("india", 0, hungaryFirst), {country:"usa", huntIndex:5});
});


test("refresh preserves different squad counts in the same country", () => {
  const india: CountryBoard = JSON.parse(readFileSync("public/data/india.json", "utf8"));
  const counts = new Set(india.setups.map((hunt) => hunt.squadBorders.length));
  assert.deepEqual([...counts].sort(), [3, 4]);
  const navigation = new Navigation(india);
  for (const count of counts) {
    const hunt = india.setups.find((candidate) => candidate.squadBorders.length === count)!;
    const game = new PatrolGame(india, hunt, undefined, navigation);
    const move = hunt.witness[0];
    assert(game.issueOrder(move.squad, move.border));
    game.advanceHours(game.activeOrder!.durationHours * 0.2);
    const store = storage();
    assert(writeProgress(store, save(game)));
    const restored = restoreProgress(readProgress(store)!, india, hunt, game.rules, navigation)!;
    assert(restored);
    assert.equal(restored.squads.length, count);
    assert.deepEqual(restored.snapshot(), game.snapshot());
    game.resolveOrder(); restored.resolveOrder();
    assert.deepEqual(restored.snapshot(), game.snapshot());
  }
});
