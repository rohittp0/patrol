import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PatrolGame, rulesForLevel } from "./engine";
import { findHint } from "./hints";
import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import { hasWinWithin } from "./setup-validation";
import type { CountryBoard } from "./types";

const board = (id: string): CountryBoard => JSON.parse(readFileSync(new URL(`../../public/data/${id}.json`, import.meta.url), "utf8"));

for (const id of ["india", "hungary"]) test(`${id}: free hints give shortest winning moves at every campaign step`, () => {
  const country = board(id);
  for (const setup of country.setups) {
    const game = new PatrolGame(country, setup, rulesForLevel(id));
    while (!game.won) {
      const before = JSON.stringify(game.snapshot());
      const hint = findHint(game);
      assert.equal(JSON.stringify(game.snapshot()), before, "Hint searches spend no time, orders, or points");
      assert.equal(hint.kind, "winning");
      if (hint.kind !== "winning") throw new Error("Expected winning hint");
      assert(hint.shortest);
      assert.equal(hint.orders.length, setup.difficulty!.minimumOrders - game.ordersUsed);
      const replay = game.fork();
      for (const order of hint.orders) { assert(replay.issueOrder(order.squad, order.border)); replay.resolveOrder(); }
      assert(replay.won, "A claimed winning continuation must win in the actual simulation");
      const order = hint.orders[0];
      assert(game.issueOrder(order.squad, order.border)); game.resolveOrder();
    }
  }
});

test("hints recompute after a move outside the stored winning sequence", () => {
  const country = board("india");
  const game = new PatrolGame(country, country.setups[0], rulesForLevel("india"));
  assert.notEqual(country.setups[0].witness[0].squad, 0);
  assert(game.issueOrder(0, 1)); game.resolveOrder();
  assert.equal(game.outcome.kind, "playing");
  const before = JSON.stringify(game.snapshot());
  const hint = findHint(game);
  assert.equal(JSON.stringify(game.snapshot()), before);
  assert.equal(hint.kind, "winning");
  if (hint.kind !== "winning") throw new Error("Expected winning hint");
  assert(hint.shortest);
  assert.equal(hint.orders.length, 1);
  assert(hasWinWithin(game, hint.orders.length));
  for (const order of hint.orders) { assert(game.issueOrder(order.squad, order.border)); game.resolveOrder(); }
  assert(game.won);
});

test("worker snapshots preserve the exact current state and stay detached", () => {
  const country = board("india");
  const game = new PatrolGame(country, country.setups[0], rulesForLevel("india"));
  assert(game.issueOrder(0, 1)); game.advanceHours(.123);
  const snapshot = game.snapshot();
  const restored = PatrolGame.fromSnapshot(country, game.setup, game.rules, snapshot);
  assert.deepEqual(restored.snapshot(), snapshot);
  restored.resolveOrder();
  assert.deepEqual(game.snapshot(), snapshot);
  snapshot.runner.position[0] += 1;
  assert.notDeepEqual(game.runner.position, snapshot.runner.position);
});

test("Hungary hints find a new two-order win after a different opening", () => {
  const country = board("hungary");
  const game = new PatrolGame(country, country.setups[0], rulesForLevel("hungary"));
  assert(game.issueOrder(0, 4)); game.resolveOrder();
  assert.equal(game.outcome.kind, "playing");
  const hint = findHint(game);
  assert.equal(hint.kind, "winning");
  if (hint.kind !== "winning") throw new Error("Expected winning hint");
  assert(hint.shortest);
  assert.equal(hint.orders.length, 2);
  assert(!hasWinWithin(game, 1));
  for (const order of hint.orders) { assert(game.issueOrder(order.squad, order.border)); game.resolveOrder(); }
  assert(game.won);
});

test("active and finished games cannot receive an order hint", () => {
  const country = board("india");
  const game = new PatrolGame(country, country.setups[0], rulesForLevel("india"));
  assert(game.issueOrder(0, 1));
  assert.deepEqual(findHint(game), { kind: "none", reason: "unavailable" });
  game.resolveOrder();
  game.outcome = { kind: "lost", reason: "budget" };
  assert.deepEqual(findHint(game), { kind: "none", reason: "unavailable" });
});

test("an exhausted search never invents a winning move or an impossibility proof", () => {
  const country = board("hungary");
  const game = new PatrolGame(country, country.setups[0], rulesForLevel("hungary"));
  const before = game.snapshot();
  const hint = findHint(game, { ...CONFIG.hints, maxSimulations: 0 });
  assert.deepEqual(hint, { kind: "none", reason: "search-limit" });
  assert.deepEqual(game.snapshot(), before);
});
