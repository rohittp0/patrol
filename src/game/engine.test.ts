import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PatrolGame, rulesForLevel } from "./engine";
import { distanceKm, Navigation } from "./navigation";
import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import { LandRoute } from "./land-route";
import { spawnClearance, validSpawn } from "./spawn";
import { hasWinWithin } from "./setup-validation";
import { countryScaleKm } from "./country-scale";
import { setupRulesSignature } from "./difficulty";
import { challengePolicy } from "./challenge-policy";
import type { CountryBoard, StartingSetup } from "./types";

function fixture() {
  const positions: [number, number][] = [[0, 0], [1, 0], [1, 0], [0, 0.1], [4, 0], [0, 0.2]];
  const board: CountryBoard = {
    id: "test", name: "Test", bounds: [[0, 0], [4, 1]], land: { type: "Polygon", coordinates: [] }, regions: [], coasts: [], landExits: [], setups: [], source: { revision: "fixture", files: {} },
    nodes: positions.map((p, i) => ({ p, kind: i === 0 ? "land" : i === 1 ? "exit" : "post", region: "inside", ...(i === 1 ? { border: 0 } : {}) })),
    links: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]].map(([a, b]) => [a, b, distanceKm(positions[a], positions[b])]),
    borders: [2, 3, 4, 5].map((node, i) => ({ id: `border-${i}`, name: `Border ${i}`, kind: "exit", regions: ["inside"], coordinates: [[i, 0], [i, 1]], post: positions[node], node, lengthKm: 100 })),
  };
  const setup: StartingSetup = { id: "test", runnerNode: 0, squadBorders: [1], witness: [] };
  const rules = { squadCount: 1, maxOrders: 8, runnerSpeedKmh: 60, squadSpeedKmh: 120 };
  return { board, setup, rules };
}

test("thinking and holding do not advance either actor", () => {
  const { board, setup, rules } = fixture();
  const game = new PatrolGame(board, setup, rules);
  const before = JSON.stringify([game.runner.position, game.squads[0].actor.position]);
  game.advanceHours(100);
  assert.equal(JSON.stringify([game.runner.position, game.squads[0].actor.position]), before);
  assert.equal(game.ordersUsed, 0);
});

test("a short squad hop still gives the runner its country-scaled travel floor", () => {
  const { board, setup, rules } = fixture();
  board.land = { type: "Polygon", coordinates: [[[-1, -1], [5, -1], [5, 5], [-1, 5], [-1, -1]]] };
  const scaledRules = { ...rules, minimumRunnerTravelFraction: 0.05 };
  const game = new PatrolGame(board, setup, scaledRules);
  const minimum = countryScaleKm(board.land) * scaledRules.minimumRunnerTravelFraction;
  assert(game.issueOrder(0, 3));
  const order = game.activeOrder!;
  assert(order.durationHours * rules.runnerSpeedKmh >= minimum, "Short hops must not starve runner travel");
  game.resolveOrder();
  assert(distanceKm([0, 0], game.runner.position) >= minimum - CONFIG.movement.arrivalToleranceKm);
  assert.equal(game.outcome.kind, "playing");
});

test("country scale shrinks with land area rather than keeping a fixed kilometre floor", () => {
  const large = countryScaleKm({ type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] });
  const small = countryScaleKm({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] });
  assert(small < large / 3.9 && small > large / 4.1);
});

function floorFixture(fraction = 0.05) {
  const { board, setup, rules } = fixture();
  board.land = { type: "Polygon", coordinates: [[[-1, -1], [5, -1], [5, 5], [-1, 5], [-1, -1]]] };
  return { board, setup, rules: { ...rules, minimumRunnerTravelFraction: fraction } };
}

test("a short trip secures its post on arrival before runner travel finishes", () => {
  const { board, setup, rules } = floorFixture();
  const game = new PatrolGame(board, setup, rules);
  assert(game.issueOrder(0, 3));
  const order = game.activeOrder!;
  assert(order.squadArrivalHours < order.durationHours);
  game.advanceHours(order.squadArrivalHours);
  assert.equal(game.squads[0].border, 3);
  assert(game.securedBorders.has(3));
  assert(game.activeOrder, "The runner still has a travel phase");
  const squadPosition = [...game.squads[0].actor.position];
  assert.equal(game.issueOrder(0, 0), false);
  game.resolveOrder();
  assert.deepEqual(game.squads[0].actor.position, squadPosition);
  assert(order.runnerTravelledKm >= game.minimumRunnerTravelKm - CONFIG.movement.arrivalToleranceKm);
  assert.equal(game.activeOrder, null);
  const runnerPosition = [...game.runner.position];
  game.advanceHours(100);
  assert.deepEqual(game.runner.position, runnerPosition);
});

test("containment on arrival ends the order before its runner travel floor", () => {
  const { board, setup, rules } = floorFixture(0.2);
  const game = new PatrolGame(board, setup, rules);
  assert(game.issueOrder(0, 0));
  const order = game.activeOrder!;
  game.resolveOrder();
  assert(game.won);
  assert(order.elapsedHours < order.durationHours);
  assert(order.runnerTravelledKm < game.minimumRunnerTravelKm);
  assert(game.securedBorders.has(0));
});

test("the runner can escape during its remaining travel after a squad arrives", () => {
  const { board, setup, rules } = floorFixture(0.2);
  const game = new PatrolGame(board, setup, rules);
  assert(game.issueOrder(0, 3));
  const order = game.activeOrder!;
  game.resolveOrder();
  assert.deepEqual(game.outcome, { kind: "lost", reason: "escape" });
  assert(order.elapsedHours > order.squadArrivalHours);
  assert(game.securedBorders.has(3));
});

test("advancing across early arrival in one frame matches many smaller frames", () => {
  const { board, setup, rules } = floorFixture();
  const whole = new PatrolGame(board, setup, rules), frames = new PatrolGame(board, setup, rules);
  assert(whole.issueOrder(0, 3)); assert(frames.issueOrder(0, 3));
  const step = whole.activeOrder!.durationHours / 200;
  whole.resolveOrder();
  for (let i = 0; i < 201; i++) frames.advanceHours(step);
  assert.deepEqual(frames.outcome, whole.outcome);
  assert.deepEqual(frames.squads.map((squad) => squad.border), whole.squads.map((squad) => squad.border));
  assert(distanceKm(frames.runner.position, whole.runner.position) < CONFIG.movement.arrivalToleranceKm);
  assert(Math.abs(frames.history[0].runnerTravelledKm - whole.history[0].runnerTravelledKm) < CONFIG.movement.arrivalToleranceKm);
});

test("a simulation fork cannot mutate the original actors, order, or history", () => {
  const { board, setup, rules } = fixture();
  const game = new PatrolGame(board, setup, rules);
  assert(game.issueOrder(0, 0));
  game.advanceHours(game.activeOrder!.durationHours / 2);
  const before = JSON.stringify([game.runner, game.squads, game.activeOrder, game.history]);
  const fork = game.fork();
  fork.resolveOrder();
  assert(fork.won);
  assert.equal(JSON.stringify([game.runner, game.squads, game.activeOrder, game.history]), before);
});

test("departure opens the origin; arrival secures the destination and contains", () => {
  const { board, setup, rules } = fixture();
  const game = new PatrolGame(board, setup, rules);
  assert(game.issueOrder(0, 0));
  assert(!game.securedBorders.has(1));
  assert(!game.securedBorders.has(0));
  game.advanceHours(game.activeOrder!.durationHours / 2);
  assert(game.runner.position[0] > 0);
  assert.notDeepEqual(game.squads[0].actor.position, board.borders[1].post);
  game.resolveOrder();
  assert(game.securedBorders.has(0));
  assert.deepEqual(game.outcome, { kind: "won", score: 7 });
});

test("occupied or invalid destinations cannot consume an order", () => {
  const { board, setup, rules } = fixture();
  setup.squadBorders.push(3);
  rules.squadCount = 2;
  const game = new PatrolGame(board, setup, rules);
  assert.equal(game.issueOrder(0, 3), false);
  assert.equal(game.issueOrder(0, 999), false);
  assert.equal(game.issueOrder(999, 0), false);
  assert.equal(game.ordersUsed, 0);
  assert(game.securedBorders.has(1));
});

test("runner can escape during travel, before the new border is secured", () => {
  const { board, setup, rules } = fixture();
  setup.squadBorders = [2];
  const game = new PatrolGame(board, setup, rules);
  assert(game.issueOrder(0, 0));
  game.resolveOrder();
  assert.deepEqual(game.outcome, { kind: "lost", reason: "escape" });
  assert(!game.securedBorders.has(0));
  assert(game.activeOrder!.elapsedHours < game.activeOrder!.durationHours);
  assert.equal(game.issueOrder(0, 1), false);
});

test("a win on the final allowed order scores zero", () => {
  const { board, setup, rules } = fixture();
  rules.maxOrders = 1;
  const game = new PatrolGame(board, setup, rules);
  game.issueOrder(0, 0);
  game.resolveOrder();
  assert.deepEqual(game.outcome, { kind: "won", score: 0 });
});

test("an exhausted budget ends the game only after the final journey resolves", () => {
  const { board, setup, rules } = fixture();
  rules.maxOrders = 1;
  const game = new PatrolGame(board, setup, rules);
  game.issueOrder(0, 3);
  assert.equal(game.outcome.kind, "playing");
  game.resolveOrder();
  assert.deepEqual(game.outcome, { kind: "lost", reason: "budget" });
  assert(game.securedBorders.has(3));
});

test("a second order is rejected while one is travelling", () => {
  const { board, setup, rules } = fixture();
  const game = new PatrolGame(board, setup, rules);
  game.issueOrder(0, 0);
  assert.equal(game.issueOrder(0, 3), false);
  assert.equal(game.ordersUsed, 1);
});

test("frame-sized advancement and full resolution produce the same result", () => {
  const { board, setup, rules } = fixture();
  const whole = new PatrolGame(board, setup, rules);
  const frames = new PatrolGame(board, setup, rules);
  whole.issueOrder(0, 0); frames.issueOrder(0, 0);
  const delta = frames.activeOrder!.durationHours / 200;
  whole.resolveOrder();
  for (let i = 0; i < 201; i++) frames.advanceHours(delta);
  assert.deepEqual(frames.outcome, whole.outcome);
  assert(distanceKm(frames.runner.position, whole.runner.position) < CONFIG.movement.arrivalToleranceKm);
});

function forecastFixture() {
  const { board, setup, rules } = fixture();
  board.nodes = [
    { p: [0, 0], kind: "land", region: "inside" },
    { p: [1, 0], kind: "portal", region: "inside", border: 0 },
    { p: [1.2, 0], kind: "exit", region: "outside" },
    { p: [0, 2], kind: "exit", region: "outside" },
    { p: [0.9, 0.1], kind: "post", region: "inside", border: 2 },
    { p: [1, 0], kind: "post", region: "inside", border: 0 },
    { p: [0, 1], kind: "post", region: "inside", border: 1 },
  ];
  board.links = [[0, 1], [1, 2], [0, 3], [4, 5]].map(([a, b]) => [a, b, distanceKm(board.nodes[a].p, board.nodes[b].p)]);
  board.borders = [5, 6, 4].map((node, index) => ({ ...board.borders[index], node, post: board.nodes[node].p }));
  setup.squadBorders = [2];
  return { board, setup, rules };
}

test("runner anticipates an arriving squad and chooses an alternative exit", () => {
  const { board, setup, rules } = forecastFixture();
  const game = new PatrolGame(board, setup, rules);
  assert.deepEqual(game.runner.route.map((waypoint) => waypoint.node), [0, 1, 2]);
  assert(game.issueOrder(0, 0));
  assert.deepEqual(game.runner.route.map((waypoint) => waypoint.node), [0, 3]);
  assert.equal(game.outcome.kind, "playing", "Anticipated closure must not count as actual containment");
  game.resolveOrder();
  assert.equal(game.outcome.kind, "playing");
  assert(game.runner.position[1] > 0);
});

test("runner still uses a closing border if it can escape before arrival", () => {
  const { board, setup, rules } = forecastFixture();
  board.nodes[4].p = [-3, 0];
  board.links[3][2] = distanceKm(board.nodes[4].p, board.nodes[5].p);
  const game = new PatrolGame(board, setup, rules);
  assert(game.issueOrder(0, 0));
  assert.deepEqual(game.runner.route.map((waypoint) => waypoint.node), [0, 1, 2]);
  game.resolveOrder();
  assert.deepEqual(game.outcome, { kind: "lost", reason: "escape" });
});

for (const level of CONFIG.levels) {
  const board: CountryBoard = JSON.parse(readFileSync(`public/data/${level.id}.json`, "utf8"));
  test(`${level.name}: the entire open navigation graph is connected`, () => {
    const navigation = new Navigation(board);
    const seen = new Set([0]);
    const queue = [0];
    for (let i = 0; i < queue.length; i++) for (const [next] of navigation.neighbors[queue[i]]) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    assert.equal(seen.size, board.nodes.length);
  });
  test(`${level.name}: compiled borders satisfy the geometry constraints (closed-ring regression)`, () => {
    assert(board.borders.length <= CONFIG.appearance.borderPalette.length);
    assert(board.borders.filter((border) => border.kind === "internal").length >= level.minimumInternalBorders);
    for (const border of board.borders) {
      assert.notDeepEqual(border.coordinates[0], border.coordinates.at(-1), border.name);
      assert(border.lengthKm >= CONFIG.map.borderLengthKm.min && border.lengthKm <= CONFIG.map.borderLengthKm.max, border.name);
      assert.equal(board.nodes[border.node].kind, "post");
      assert.deepEqual(board.nodes[border.node].p, border.post);
    }
  });
  test(`${level.name}: every published setup has its verified difficulty and winning sequence`, async () => {
    assert.equal(board.setups.length, CONFIG.setups.poolSize);
    assert(board.setups.every((setup) => board.setups.filter((other) => other.runnerNode === setup.runnerNode).length <= CONFIG.setups.maxSetupsPerRunner), "Too many hunts share one starting location");
    assert.equal(new Set(board.setups.map((setup) => JSON.stringify([setup.runnerNode, [...setup.squadBorders].sort((a, b) => a - b)]))).size, board.setups.length, "Repeated starting position and squad assignments");
    const spawnRegions = new Set(board.setups.map((setup) => board.nodes[setup.runnerNode].region));
    assert(spawnRegions.size >= Math.ceil(CONFIG.setups.poolSize / CONFIG.setups.maxSetupsPerRegion));
    const navigation = new Navigation(board);
    const land = new LandRoute(board.land);
    let previousScore = -Infinity;
    for (const [index, setup] of board.setups.entries()) {
      const policy = challengePolicy(index);
      const rules = rulesForLevel(board.id, setup.squadBorders.length);
      const signature = await setupRulesSignature(board, rules);
      assert(setup.witness.length >= policy.minimumOrders && setup.witness.length <= policy.maximumWitnessOrders);
      assert.equal(setup.difficulty?.minimumOrders, policy.minimumOrders);
      assert.equal(setup.difficulty.rulesSignature, signature);
      assert(setup.difficulty.score >= previousScore);
      previousScore = setup.difficulty.score;
      assert(setup.difficulty.escapePressure >= level.escapePressureRange.min && setup.difficulty.escapePressure <= level.escapePressureRange.max);
      assert(validSpawn(spawnClearance(board, board.nodes[setup.runnerNode].p), level), `${setup.id}: runner spawned too close to a border`);
      const game = new PatrolGame(board, setup, rules, navigation);
      assert.equal(game.outcome.kind, "playing", setup.id);
      for (const order of setup.witness) {
        assert(game.issueOrder(order.squad, order.border), setup.id);
        const path = game.activeOrder!.path;
        assert(path.slice(1).every((point, i) => land.allows(path[i], point)), `${setup.id}: squad route crossed water`);
        game.resolveOrder();
      }
      assert(game.won, setup.id);
      assert(game.ordersUsed <= game.rules.maxOrders);
      assert.equal(hasWinWithin(new PatrolGame(board, setup, game.rules, navigation), policy.minimumOrders - 1), false, `${setup.id}: a shorter solution exists`);
    }
  });
  test(`${level.name}: curved squad movement is independent of animation frame size`, () => {
    const setup = board.setups[0];
    assert(setup, "A verified setup is required");
    const whole = new PatrolGame(board, setup);
    const frames = new PatrolGame(board, setup);
    const order = setup.witness[0];
    assert(whole.issueOrder(order.squad, order.border));
    assert(frames.issueOrder(order.squad, order.border));
    const delta = frames.activeOrder!.durationHours / 200;
    whole.resolveOrder();
    for (let i = 0; i < 201; i++) frames.advanceHours(delta);
    assert.deepEqual(frames.outcome, whole.outcome);
    assert.deepEqual(frames.squads.map((squad) => squad.border), whole.squads.map((squad) => squad.border));
    assert(distanceKm(frames.runner.position, whole.runner.position) < CONFIG.movement.arrivalToleranceKm);
    assert(distanceKm(frames.squads[order.squad].actor.position, whole.squads[order.squad].actor.position) < CONFIG.movement.arrivalToleranceKm);
  });
}

test("hunts progress within each country, then reset for the next introduction", () => {
  for (const level of CONFIG.levels) {
    let previous = -Infinity;
    const board: CountryBoard = JSON.parse(readFileSync(`public/data/${level.id}.json`, "utf8"));
    for (const setup of board.setups) {
      assert(setup.difficulty && setup.difficulty.score >= previous, `${setup.id}: difficulty dropped`);
      previous = setup.difficulty.score;
    }
  }
});
