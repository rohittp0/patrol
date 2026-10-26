import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  ECONOMY,
  applyAction,
  awardWin,
  newPlayer,
  readySquad,
  rewardFor,
  settleTraining,
  statsFor,
} from "./collection";
import { createMission, replayAttempt, type Mission } from "./missions";
import { Navigation, distanceKm } from "./navigation";
import { PatrolGame, type GameRules } from "./engine";
import { findHint } from "./hints";
import type { CountryBoard, StartingSetup } from "./types";

test("reward tiers and replay differences cannot farm money", () => {
  assert.deepEqual(
    [2, 3, 5, 6, 15].map((n) => rewardFor(1, n)),
    [90, 60, 60, 30, 30],
  );
  let p = newPlayer();
  let result = awardWin(p, 1, 6);
  assert.equal(result.reward, 30);
  p = result.player;
  result = awardWin(p, 1, 5);
  assert.equal(result.reward, 30);
  p = result.player;
  result = awardWin(p, 1, 4);
  assert.equal(result.reward, 0);
  assert.equal(result.player.results["1"].bestMoves, 4);
  p = result.player;
  result = awardWin(p, 1, 2);
  assert.equal(result.reward, 30);
  p = result.player;
  assert.equal(awardWin(p, 1, 2).reward, 0);
  assert.equal(awardWin(p, 1, 7).reward, 0);
  assert.equal(p.wallet, 90);
  assert.throws(() => awardWin(p, 3, 2), /locked/);
  assert.throws(() => rewardFor(1, 0));
  assert.throws(() => rewardFor(1, 16));
});
test("specialists unlock, buy once and train sequentially with a supplied clock", () => {
  let p = newPlayer();
  p.wallet = 500;
  assert.throws(
    () => applyAction(p, { kind: "purchase", squad: "rapid" }, 0),
    /Level 3/,
  );
  p.unlocked = 3;
  p = applyAction(p, { kind: "purchase", squad: "rapid" }, 1000);
  assert.equal(p.wallet, 475);
  assert.throws(
    () => applyAction(p, { kind: "purchase", squad: "rapid" }, 0),
    /owned/,
  );
  p = applyAction(p, { kind: "train", squad: "rapid" }, 1000);
  assert.equal(p.squads.rapid!.training!.readyAt, 31000);
  assert.equal(readySquad(p, "rapid", 30999), false);
  assert.throws(
    () => applyAction(p, { kind: "train", squad: "rapid" }, 2000),
    /cannot/,
  );
  assert.throws(
    () =>
      applyAction(
        p,
        { kind: "selection", selection: ["rapid", null, null] },
        30000,
      ),
    /unavailable/,
  );
  p = settleTraining(p, 31000);
  assert.equal(p.squads.rapid!.step, 1);
  assert.equal(p.squads.rapid!.training, null);
  p = applyAction(p, { kind: "train", squad: "rapid" }, 31000);
  assert.equal(p.squads.rapid!.training!.readyAt, 91000);
  assert.equal(
    p.squads.rapid!.step,
    1,
    "Upgrade applies only on training completion",
  );
});
test("empty slots and simultaneous training are legal; duplicate and unowned selections are rejected", () => {
  let p = newPlayer();
  p.unlocked = 15;
  p.wallet = 1000;
  for (const squad of ["rapid", "helicopter", "marksman"] as const) {
    p = applyAction(p, { kind: "purchase", squad }, 0);
    p = applyAction(p, { kind: "train", squad }, 0);
  }
  p = applyAction(p, { kind: "selection", selection: [null, null, null] }, 0);
  assert.deepEqual(p.selection, [null, null, null]);
  p = applyAction(
    p,
    { kind: "selection", selection: ["patrol-1", null, null] },
    0,
  );
  assert.equal(p.selection[0], "patrol-1");
  assert.throws(() =>
    applyAction(
      p,
      { kind: "selection", selection: ["patrol-1", "patrol-1", null] },
      0,
    ),
  );
  assert.throws(() =>
    applyAction(
      newPlayer(),
      { kind: "selection", selection: ["marksman", null, null] },
      0,
    ),
  );
  assert.throws(() =>
    applyAction(
      newPlayer(),
      { kind: "selection", selection: ["__proto__" as never, null, null] },
      0,
    ),
  );
});

const board: CountryBoard = JSON.parse(
  readFileSync(
    new URL("../../public/data/india.json", import.meta.url),
    "utf8",
  ),
);
const campaign = JSON.parse(
  readFileSync(
    new URL("../../public/data/india-campaign.json", import.meta.url),
    "utf8",
  ),
);
const navigation = new Navigation(board);
test("all 15 India missions have distinct spawns and verified upgraded winning witnesses", () => {
  assert.equal(campaign.levels.length, 15);
  assert.equal(
    new Set(campaign.levels.map((m: Mission) => m.runnerNode)).size,
    15,
  );
  assert.equal(
    campaign.configHash,
    createHash("sha256").update(JSON.stringify(ECONOMY)).digest("hex"),
    "Regenerate campaign after tuning changes",
  );
  assert.equal(
    campaign.geometryHash,
    createHash("sha256")
      .update(
        JSON.stringify([board.land, board.borders, board.nodes, board.links]),
      )
      .digest("hex"),
  );
  let basicFailures = 0;
  for (const mission of campaign.levels as Mission[]) {
    const p = newPlayer();
    p.unlocked = 15;
    mission.recommended.forEach(
      ({ id, step }) => (p.squads[id] = { step, training: null }),
    );
    const attempt = createMission(
      board,
      mission,
      p,
      mission.recommended.map((x) => x.id),
      0,
      navigation,
    );
    assert.equal(attempt.game.outcome.kind, "playing");
    const replay = replayAttempt(
      board,
      { ...attempt, moves: mission.witness },
      navigation,
    );
    assert(replay.won, mission.id);
    assert(replay.ordersUsed <= 15);
    assert.equal(mission.verification!.moves, replay.ordersUsed);
    const basic = newPlayer();
    basic.unlocked = 15;
    const game = createMission(
      board,
      mission,
      basic,
      ["patrol-1", "patrol-2", "patrol-3"],
      0,
      navigation,
    ).game;
    for (const move of mission.witness) {
      if (!game.issueOrder(move.squad, move.border)) break;
      game.resolveOrder();
    }
    if (!game.won) basicFailures++;
  }
  assert(
    basicFailures >= 10,
    "Later witnesses must require stronger capabilities, not just new labels",
  );
});
test("minimum rewards cover every available upgrade before the next specialist unlock", () => {
  const allTraining = ECONOMY.upgradeCosts.reduce((a, b) => a + b, 0);
  const earnedBefore = (level: number) =>
    Array.from({ length: level - 1 }, (_, i) => rewardFor(i + 1, 15)).reduce(
      (a, b) => a + b,
      0,
    );
  assert(earnedBefore(3) >= ECONOMY.catalog.rapid.price);
  assert(
    earnedBefore(6) >=
      ECONOMY.catalog.rapid.price +
        allTraining +
        ECONOMY.catalog.helicopter.price,
  );
  assert(
    earnedBefore(10) >=
      ECONOMY.catalog.rapid.price +
        ECONOMY.catalog.helicopter.price +
        allTraining * 2 +
        ECONOMY.catalog.marksman.price,
  );
  assert(
    earnedBefore(11) >=
      Object.values(ECONOMY.catalog).reduce((n, s) => n + s.price, 0) +
        allTraining * 3,
  );
});
function fixture(): {
  board: CountryBoard;
  setup: StartingSetup;
  rules: GameRules;
} {
  const positions: [number, number][] = [
    [0, 0],
    [5, 0],
    [5, 0],
    [1, 0.1],
    [0, 0.2],
    [4, 0.3],
    [0.2, 0.2],
  ];
  const board: CountryBoard = {
    id: "fixture",
    name: "Fixture",
    bounds: [
      [0, 0],
      [5, 1],
    ],
    land: { type: "Polygon", coordinates: [] },
    regions: [],
    coasts: [],
    landExits: [],
    setups: [],
    source: { revision: "test", files: {} },
    nodes: positions.map((p, i) => ({
      p,
      kind: i === 0 ? "land" : i === 1 ? "exit" : "post",
      region: "inside",
      ...(i === 1 ? { border: 0 } : {}),
    })),
    links: [1, 2, 3, 4, 5, 6].map((i) => [
      0,
      i,
      distanceKm(positions[0], positions[i]),
    ]),
    borders: [2, 3, 4, 5, 6].map((node, i) => ({
      id: `b${i}`,
      name: `Border ${i}`,
      kind: "exit",
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
  return {
    board,
    setup: { id: "fixture", runnerNode: 0, squadBorders: [1, 2], witness: [] },
    rules: {
      squadCount: 2,
      maxOrders: 15,
      runnerSpeedKmh: 60,
      squadSpeedKmh: 120,
      units: [
        { ...statsFor("marksman", 0), radiusKm: 15 },
        statsFor("patrol-1", 0),
      ],
    },
  };
}
test("Marksman intercepts a range crossing independent of frame size and cannot fire in transit", () => {
  const { board, setup, rules } = fixture();
  const whole = new PatrolGame(board, setup, rules),
    frames = new PatrolGame(board, setup, rules);
  assert(whole.issueOrder(1, 3));
  assert(frames.issueOrder(1, 3));
  const duration = whole.activeOrder!.durationHours;
  whole.resolveOrder();
  for (let i = 0; i < 1001; i++) frames.advanceHours(duration / 1000);
  assert(whole.won);
  assert(frames.won);
  assert(distanceKm(whole.runner.position, frames.runner.position) < 0.001);
  const moving = new PatrolGame(board, setup, rules);
  assert(moving.issueOrder(0, 3));
  moving.resolveOrder();
  assert(!moving.won, "A relocating Marksman cannot shoot along the route");
});
test("helicopters have constant flight time, guard subsequent moves, expire and redeploy", () => {
  const { board } = fixture();
  const setup = {
    id: "flight",
    runnerNode: 0,
    squadBorders: [-1, 2],
    witness: [],
  };
  const rules = {
    squadCount: 2,
    maxOrders: 15,
    runnerSpeedKmh: 60,
    squadSpeedKmh: 120,
    units: [
      { ...statsFor("helicopter", 0), deploymentHours: 0.01 },
      statsFor("patrol-1", 0),
    ],
  };
  const game = new PatrolGame(board, setup, rules);
  assert.equal(game.squads[0].border, null);
  assert(game.issueOrder(0, 1));
  assert.equal(game.activeOrder!.squadArrivalHours, 0.01);
  game.resolveOrder();
  assert.equal(game.squads[0].guardLeft, 2);
  assert(game.issueOrder(1, 4));
  game.resolveOrder();
  assert.equal(game.squads[0].guardLeft, 1);
  assert(game.issueOrder(1, 2));
  game.resolveOrder();
  assert.equal(game.squads[0].border, null);
  assert.equal(game.ordersUsed, 3);
  assert(game.issueOrder(0, 3));
  assert.equal(game.activeOrder!.squadArrivalHours, 0.01);
  game.resolveOrder();
  assert.equal(game.squads[0].border, 3);
  assert.equal(game.ordersUsed, 4);
});
test("ability hints replay a real win without claiming shortest-path proof", () => {
  const { board, setup, rules } = fixture();
  const game = new PatrolGame(board, setup, rules);
  const hint = findHint(game, {
    searchTimeMs: 3000,
    maxSimulations: 1000,
    maxEnclosureRegions: 3,
  });
  assert.equal(hint.kind, "winning");
  if (hint.kind !== "winning") throw new Error("No hint");
  assert.equal(hint.shortest, false);
  for (const move of hint.orders) {
    assert(game.issueOrder(move.squad, move.border));
    game.resolveOrder();
  }
  assert(game.won);
});
