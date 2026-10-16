import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PatrolGame, rulesForLevel } from "./engine";
import { Navigation } from "./navigation";
import type { CountryBoard } from "./types";
import { guidedHuntStep } from "./guided-hunt";
import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";

const board: CountryBoard = JSON.parse(readFileSync(new URL("../../public/data/usa.json", import.meta.url), "utf8"));
const setup = [...board.setups].sort((a, b) => a.difficulty!.score - b.difficulty!.score || a.id.localeCompare(b.id))[0];
const navigation = new Navigation(board);
const rules = rulesForLevel(board.id, setup.squadBorders.length);
const hunt = () => new PatrolGame(board, setup, rules, navigation);

for (const level of CONFIG.levels) test(`${level.id}: the real opening hunt teaches each move through capture`, () => {
  const board: CountryBoard = JSON.parse(readFileSync(new URL(`../../public/data/${level.id}.json`, import.meta.url), "utf8"));
  const setup = [...board.setups].sort((a, b) => a.difficulty!.score - b.difficulty!.score || a.id.localeCompare(b.id))[0];
  const game = new PatrolGame(board, setup, rulesForLevel(board.id, setup.squadBorders.length));
  for (const [move, order] of setup.witness.entries()) {
    assert.deepEqual(guidedHuntStep(game, null), { kind: "post", move, order });
    assert.deepEqual(guidedHuntStep(game, order.border), { kind: "squad", move, order });
    assert(game.issueOrder(order.squad, order.border));
    assert.deepEqual(guidedHuntStep(game, null), { kind: "moving", move, order });
    game.resolveOrder();
  }
  assert.equal(game.outcome.kind, "won");
  assert.deepEqual(guidedHuntStep(game, null), { kind: "complete" });
});

test("refresh can reconstruct the squad prompt, in-flight explanation and next move", () => {
  const game = hunt(), first = setup.witness[0];
  const restore = () => PatrolGame.fromSnapshot(board, setup, rules, JSON.parse(JSON.stringify(game.snapshot())), navigation);
  assert.equal(guidedHuntStep(restore(), first.border)?.kind, "squad");
  assert(game.issueOrder(first.squad, first.border));
  game.advanceHours(game.activeOrder!.durationHours / 2);
  assert.equal(guidedHuntStep(restore(), null)?.kind, "moving");
  game.resolveOrder();
  assert.deepEqual(guidedHuntStep(restore(), null), { kind: "post", move: 1, order: setup.witness[1] });
});

test("guidance does not take over an unrelated saved chase or manufacture a completed tutorial", () => {
  const game = hunt(), first = setup.witness[0];
  assert(game.issueOrder(first.squad, first.border));
  assert.equal(guidedHuntStep({ ...game, history: [{ ...game.history[0], to: first.border + 1 }] }, null), null);
  assert.equal(guidedHuntStep({ ...game, history: [] }, null), null);
  assert.equal(guidedHuntStep({ ...game, activeOrder: { ...game.activeOrder!, squad: (first.squad + 1) % game.squads.length } }, null), null);
  assert.equal(guidedHuntStep({ ...game, outcome: { kind: "lost", reason: "escape" } }, null), null);
  assert.equal(guidedHuntStep({ ...game, outcome: { kind: "won", score: 7 } }, null), null);
});
