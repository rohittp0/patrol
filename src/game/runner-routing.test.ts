import test from "node:test";
import { readFileSync } from "node:fs";
import { LandRoute } from "./land-route";
import assert from "node:assert/strict";
import { PatrolGame } from "./engine";
import { countryScaleKm } from "./country-scale";
import { distanceKm, Navigation } from "./navigation";
import type { CountryBoard, Position, StartingSetup } from "./types";

function midEdgeFixture() {
  const positions: Position[] = [
    [0, 0],
    [1.79, 0],
    [2.25, 0],
    [2.3, 0],
    [1.79, 1.35],
    [4.72, 0],
    [4, 0],
    [5, 3],
    [5, 3.01],
  ];
  const land: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [-1, -1],
        [6, -1],
        [6, 5],
        [-1, 5],
        [-1, -1],
      ],
    ],
  };
  const board: CountryBoard = {
    id: "test",
    name: "Test",
    bounds: [
      [-1, -1],
      [6, 5],
    ],
    land,
    regions: [],
    coasts: [],
    landExits: [],
    source: { revision: "fixture", files: {} },
    setups: [],
    nodes: positions.map((p, i) => ({
      p,
      kind: i <= 1 ? "land" : i === 2 ? "portal" : i <= 4 ? "exit" : "post",
      region: "inside",
      ...(i === 2 ? { border: 0 } : i === 4 ? { border: 1 } : {}),
    })),
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
      [1, 4],
      [5, 6],
      [7, 8],
    ].map(([a, b]) => [a, b, distanceKm(positions[a], positions[b])]),
    borders: [5, 6, 7, 8].map((node, i) => ({
      id: `b${i}`,
      name: `Border ${i}`,
      kind: i === 0 ? "internal" : "exit",
      regions: ["inside"],
      coordinates: [
        [i, 0],
        [i, 1],
      ],
      post: positions[node],
      node,
      lengthKm: 100,
    })),
  };
  const setup: StartingSetup = {
    id: "mid-edge",
    runnerNode: 0,
    squadBorders: [2, 1],
    witness: [],
  };
  const rules = {
    squadCount: 2,
    maxOrders: 8,
    runnerSpeedKmh: 60,
    squadSpeedKmh: 120,
    minimumRunnerTravelFraction: 200 / countryScaleKm(land),
  };
  return { board, setup, rules };
}

test("runner takes an open escape instead of doubling back from a border it cannot reach before closure", () => {
  const { board, setup, rules } = midEdgeFixture();
  const game = new PatrolGame(board, setup, rules);
  assert(game.issueOrder(0, 3));
  game.resolveOrder();
  assert.equal(game.outcome.kind, "playing");
  assert.equal(game.runner.atNode, null);
  assert.deepEqual(game.runner.edge, [1, 2]);
  const escapeKm =
    distanceKm(game.runner.position, board.nodes[1].p) +
    distanceKm(board.nodes[1].p, board.nodes[4].p);
  assert(
    escapeKm < game.minimumRunnerTravelKm,
    "The newly opened exit is reachable during this move",
  );
  assert(game.issueOrder(1, 0));
  const order = game.activeOrder!;
  assert(
    distanceKm(game.runner.position, board.nodes[2].p) >
      order.squadArrivalHours * rules.runnerSpeedKmh,
    "The old forward portal will close before the runner can reach it",
  );
  game.resolveOrder();
  assert.deepEqual(
    game.outcome,
    { kind: "lost", reason: "escape" },
    `Runner missed a ${escapeKm.toFixed(1)} km open escape despite ${order.runnerTravelledKm.toFixed(1)} km of travel`,
  );
  assert(
    Math.abs(order.runnerTravelledKm - escapeKm) < 0.0001,
    "No detour towards the doomed border",
  );
});

test("runner crosses a closing border before arrival even when the exit lies farther beyond it", () => {
  const { board, setup, rules } = midEdgeFixture();
  board.nodes[3].p = [3.5, 0];
  board.nodes[4].p = [1.79, 2.25];
  board.nodes[5].p = [5.08, 0]; // 120 km transfer: runner can cover 60 km before closure.
  for (const link of board.links)
    link[2] = distanceKm(board.nodes[link[0]].p, board.nodes[link[1]].p);
  board.borders[0].post = board.nodes[5].p;
  const game = new PatrolGame(board, setup, rules);
  assert(game.issueOrder(0, 3));
  game.resolveOrder();
  const crossingKm = distanceKm(game.runner.position, board.nodes[2].p);
  const exitKm = crossingKm + distanceKm(board.nodes[2].p, board.nodes[3].p);
  assert(game.issueOrder(1, 0));
  const order = game.activeOrder!;
  assert(crossingKm < order.squadArrivalHours * rules.runnerSpeedKmh);
  assert(exitKm > order.squadArrivalHours * rules.runnerSpeedKmh);
  game.advanceHours(order.squadArrivalHours);
  assert.equal(game.squads[1].border, 0);
  assert.equal(
    game.outcome.kind,
    "playing",
    "Runner has crossed but not reached the exit yet",
  );
  assert(game.runner.position[0] > board.nodes[2].p[0]);
  game.resolveOrder();
  assert.deepEqual(game.outcome, { kind: "lost", reason: "escape" });
  assert(Math.abs(order.runnerTravelledKm - exitKm) < 0.0001);
});

function zigzagFixture() {
  const positions: Position[] = [
    [0, 0],
    [1.8, 0],
    [0, 1],
    [2, 1],
    [2.1, 1],
    [2.2, 1],
    [1, 1.8],
    [1, 1.81],
    [2, 1.7],
  ];
  const polygon = (left: number, right: number): GeoJSON.Polygon => ({
    type: "Polygon",
    coordinates: [
      [
        [left, -1],
        [right, -1],
        [right, 2],
        [left, 2],
        [left, -1],
      ],
    ],
  });
  const land = polygon(-1, 2.2);
  const board: CountryBoard = {
    id: "test",
    name: "Test",
    bounds: [
      [-1, -1],
      [2.2, 2],
    ],
    land,
    regions: [
      { id: "left", name: "Left", geometry: polygon(-1, 2) },
      { id: "right", name: "Right", geometry: polygon(2, 2.2) },
    ],
    coasts: [],
    landExits: [],
    source: { revision: "fixture", files: {} },
    setups: [],
    nodes: positions.map((p, i) => ({
      p,
      kind:
        i <= 2 || i === 4
          ? "land"
          : i === 3
            ? "portal"
            : i === 5
              ? "exit"
              : "post",
      region: i === 4 || i === 5 ? "right" : "left",
      ...(i === 3 ? { border: 0 } : {}),
    })),
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [6, 7],
    ].map(([a, b]) => [a, b, distanceKm(positions[a], positions[b])]),
    borders: [8, 6, 7].map((node, i) => ({
      id: `b${i}`,
      name: `Border ${i}`,
      kind: i === 0 ? "internal" : "exit",
      regions: i === 0 ? ["left", "right"] : ["left"],
      coordinates: [
        [i, 0],
        [i, 1],
      ],
      post: positions[node],
      node,
      lengthKm: 100,
    })),
  };
  const setup: StartingSetup = {
    id: "zigzag",
    runnerNode: 0,
    squadBorders: [1],
    witness: [],
  };
  const rules = {
    squadCount: 1,
    maxOrders: 8,
    runnerSpeedKmh: 60,
    squadSpeedKmh: 120,
    minimumRunnerTravelFraction: 300 / countryScaleKm(land),
  };
  return { board, setup, rules };
}

test("runner escapes across clear land instead of wasting its travel on triangle-centre zigzags", () => {
  const { board, setup, rules } = zigzagFixture();
  const game = new PatrolGame(board, setup, rules);
  const direct =
    distanceKm(board.nodes[0].p, board.nodes[3].p) +
    distanceKm(board.nodes[3].p, board.nodes[5].p);
  assert(direct < game.minimumRunnerTravelKm);
  assert(game.issueOrder(0, 2));
  game.resolveOrder();
  assert.deepEqual(game.outcome, { kind: "lost", reason: "escape" });
  assert(Math.abs(game.history[0].runnerTravelledKm - direct) < 0.0001);
});

test("a clear-looking geometric shortcut cannot bypass a guarded border", () => {
  const { board, setup, rules } = zigzagFixture();
  setup.squadBorders = [0];
  const game = new PatrolGame(board, setup, rules);
  assert(game.won);
});

test("crossing deadlines use the shortened land route, not the old triangle detour", () => {
  const { board, setup, rules } = zigzagFixture();
  board.nodes[6].p = [-1, 1.7];
  board.links[board.links.length - 1] = [
    6,
    8,
    distanceKm(board.nodes[6].p, board.nodes[8].p),
  ];
  rules.squadSpeedKmh = 60;
  board.borders[1].post = board.nodes[6].p;
  const game = new PatrolGame(board, setup, rules);
  assert(game.issueOrder(0, 0));
  const order = game.activeOrder!;
  const directCrossing = distanceKm(board.nodes[0].p, board.nodes[3].p);
  const oldCrossing = board.links
    .slice(0, 3)
    .reduce((sum, link) => sum + link[2], 0);
  const deadline = order.squadArrivalHours * rules.runnerSpeedKmh;
  assert(directCrossing < deadline && oldCrossing > deadline);
  game.resolveOrder();
  assert.deepEqual(game.outcome, { kind: "lost", reason: "escape" });
  assert(order.elapsedHours < order.squadArrivalHours);
});

test("shortened runner paths preserve the occupied side and frame-independent arrival timing", () => {
  const { board, setup, rules } = zigzagFixture();
  board.nodes[6].p = [-1, 1.7];
  board.links[board.links.length - 1] = [
    6,
    8,
    distanceKm(board.nodes[6].p, board.nodes[8].p),
  ];
  rules.squadSpeedKmh = 60;
  board.borders[1].post = board.nodes[6].p;
  const whole = new PatrolGame(board, setup, rules),
    frames = new PatrolGame(board, setup, rules);
  assert(whole.issueOrder(0, 0));
  assert(frames.issueOrder(0, 0));
  whole.resolveOrder();
  const hours = frames.activeOrder!.durationHours / 200;
  for (let i = 0; i < 201; i++) frames.advanceHours(hours);
  assert.deepEqual(frames.outcome, whole.outcome);
  assert(distanceKm(frames.runner.position, whole.runner.position) < 0.000001);
  assert.equal(board.nodes[frames.runner.lastLandNode].region, "right");
});

test("Wisconsin fugitive takes the visible land corridor to its first border", () => {
  const board: CountryBoard = JSON.parse(
    readFileSync("public/data/usa.json", "utf8"),
  );
  const runnerNode = board.nodes.findIndex(
    (node) =>
      node.kind === "land" &&
      distanceKm(node.p, [-90.3846387, 44.0448283]) < 0.001,
  );
  assert(runnerNode >= 0, "Pinned Wisconsin regression spawn");
  const game = new PatrolGame(board, {
    id: "wisconsin-route",
    runnerNode,
    squadBorders: [99, 102, 69, 62],
    witness: [],
  });
  let previous = game.runner.position,
    travelled = 0;
  for (const point of game.runner.route) {
    travelled += distanceKm(previous, point.position);
    previous = point.position;
    if (point.node !== null && board.nodes[point.node].border !== undefined)
      break;
  }
  assert(
    travelled < 110,
    `Clear land approach took ${travelled.toFixed(1)} km instead of roughly 96 km`,
  );
});

for (const id of ["usa", "india", "hungary"])
  test(`${id}: fugitive shortcuts stay inside one land face between border crossings`, () => {
    const board: CountryBoard = JSON.parse(
      readFileSync(`public/data/${id}.json`, "utf8"),
    );
    const faces = board.regions.map((region) => new LandRoute(region.geometry));
    for (const setup of board.setups) {
      const game = new PatrolGame(board, setup);
      const check = () => {
        let previous = game.runner.position;
        for (const point of game.runner.route) {
          assert(
            faces.some((face) => face.allows(previous, point.position)),
            `${setup.id}: shortcut crossed water or an administrative boundary`,
          );
          if (
            point.node !== null &&
            board.nodes[point.node].border !== undefined
          )
            assert(
              !game.securedBorders.has(board.nodes[point.node].border!),
              `${setup.id}: guarded crossing in route`,
            );
          previous = point.position;
        }
      };
      check();
      for (const order of setup.witness) {
        if (!game.issueOrder(order.squad, order.border)) break;
        check();
        game.advanceHours(game.activeOrder!.squadArrivalHours);
        check();
        game.resolveOrder();
        if (game.outcome.kind !== "playing") break;
        check();
      }
    }
  });

test("shared navigation caches give every game an independent consumable route", () => {
  const { board, setup, rules } = zigzagFixture(),
    navigation = new Navigation(board);
  const first = new PatrolGame(board, setup, rules, navigation),
    second = new PatrolGame(board, setup, rules, navigation);
  const distance = second.runnerEscapeDistanceKm;
  assert(first.issueOrder(0, 2));
  first.resolveOrder();
  assert.equal(second.runnerEscapeDistanceKm, distance);
  const third = new PatrolGame(board, setup, rules, navigation);
  assert.equal(third.runnerEscapeDistanceKm, distance);
  assert(third.issueOrder(0, 2));
  third.resolveOrder();
  assert.deepEqual(third.outcome, { kind: "lost", reason: "escape" });
});
