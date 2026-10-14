import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PatrolGame, rulesForLevel } from "./engine";
import { findHint } from "./hints";
import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import { hasWinWithin } from "./setup-validation";
import type { CountryBoard } from "./types";

const board = (id: string): CountryBoard => JSON.parse(readFileSync(new URL(`../../public/data/${id}.json`, import.meta.url), "utf8"));

for (const { id } of CONFIG.levels) test(`${id}: free hints give shortest winning moves at every campaign step`, () => {
  const country = board(id);
  for (const setup of country.setups) {
    const game = new PatrolGame(country, setup, rulesForLevel(id, setup.squadBorders.length));
    while (!game.won) {
      const before = JSON.stringify(game.snapshot());
      const hint = findHint(game);
      assert.equal(JSON.stringify(game.snapshot()), before, "Hint searches spend no time, orders, or points");
      assert.equal(hint.kind, "winning");
      if (hint.kind !== "winning") throw new Error("Expected winning hint");
      if (setup.witness.length === setup.difficulty!.minimumOrders) {
        assert(hint.shortest);
        assert.equal(hint.orders.length, setup.difficulty!.minimumOrders - game.ordersUsed);
      } else assert(hint.orders.length <= setup.witness.length - game.ordersUsed);
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
  // Preserve a real off-script position independently of campaign reordering.
  const setup = {"id": "india-alternate-opening-regression", "runnerNode": 3044, "squadBorders": [0, 2, 4], "witness": [{"squad": 1, "border": 1}, {"squad": 2, "border": 3}]};
  const game = new PatrolGame(country, setup, { ...rulesForLevel("india"), squadCount: setup.squadBorders.length });
  assert.notEqual(setup.witness[0].squad, 0);
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
  const game = new PatrolGame(country, country.setups[0], rulesForLevel("india", country.setups[0].squadBorders.length));
  const move = game.setup.witness[0];
  assert(game.issueOrder(move.squad, move.border)); game.advanceHours(.123);
  const snapshot = game.snapshot();
  const restored = PatrolGame.fromSnapshot(country, game.setup, game.rules, snapshot);
  assert.deepEqual(restored.snapshot(), snapshot);
  restored.resolveOrder();
  assert.deepEqual(game.snapshot(), snapshot);
  snapshot.runner.position[0] += 1;
  assert.notDeepEqual(game.runner.position, snapshot.runner.position);
});

test("Hungary hints find a four-move rescue after a different opening", () => {
  const country = board("hungary");
  // Keep this position independent of campaign curation. The direct-moving
  // fugitive defeats the old two-move rescue, but a four-move route still wins.
  const setup = { id: "alternate-opening-regression", runnerNode: 258, squadBorders: [8, 0, 37, 1], witness: [] };
  const game = new PatrolGame(country, setup, rulesForLevel("hungary"));
  assert(game.issueOrder(0, 4)); game.resolveOrder();
  assert.equal(game.outcome.kind, "playing");
  const hint = findHint(game);
  assert.equal(hint.kind, "winning");
  if (hint.kind !== "winning") throw new Error("Expected winning hint");
  assert(hint.shortest);
  assert.equal(hint.orders.length, 4);
  assert(!hasWinWithin(game, 1));
  for (const order of hint.orders) { assert(game.issueOrder(order.squad, order.border)); game.resolveOrder(); }
  assert(game.won);
});

test("active and finished games cannot receive an order hint", () => {
  const country = board("india");
  const game = new PatrolGame(country, country.setups[0], rulesForLevel("india", country.setups[0].squadBorders.length));
  const move = game.setup.witness[0];
  assert(game.issueOrder(move.squad, move.border));
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
