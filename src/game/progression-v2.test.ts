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
    [36, 24, 24, 12, 12],
  );
  let p = newPlayer();
  let result = awardWin(p, 1, 6);
  assert.equal(result.reward, 12);
  p = result.player;
  result = awardWin(p, 1, 5);
  assert.equal(result.reward, 12);
  p = result.player;
  result = awardWin(p, 1, 4);
  assert.equal(result.reward, 0);
  assert.equal(result.player.results["1"].bestMoves, 4);
  p = result.player;
  result = awardWin(p, 1, 2);
  assert.equal(result.reward, 12);
  p = result.player;
  assert.equal(awardWin(p, 1, 2).reward, 0);
  assert.equal(awardWin(p, 1, 7).reward, 0);
  assert.equal(p.wallet, 36);
  assert.throws(() => awardWin(p, 3, 2), /locked/);
  assert.throws(() => rewardFor(1, 0));
  assert.throws(() => rewardFor(1, 16));
});
test("specialists unlock, buy once and train sequentially with a supplied clock", () => {
  let p = newPlayer();
  p.wallet = 500;
  assert.throws(
    () => applyAction(p, { kind: "purchase", squad: "rapid" }, 0),
    /Level 6/,
  );
  p.unlocked = 6;
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
  p.unlocked = 16;
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

const hashOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const chapters = ECONOMY.chapters.map((chapter) => {
  const board: CountryBoard = JSON.parse(readFileSync(new URL(`../../public/data/${chapter.country}.json`, import.meta.url), "utf8"));
  const campaign = JSON.parse(readFileSync(new URL(`../../public/data/${chapter.country}-campaign.json`, import.meta.url), "utf8"));
  return { chapter, board, campaign, navigation: new Navigation(board) };
});
test("every campaign level follows the difficulty plan with a verified winning witness", () => {
  const all: Mission[] = chapters.flatMap(({ campaign }) => campaign.levels);
  assert.deepEqual(all.map((m) => m.number), Array.from({ length: ECONOMY.levelCount }, (_, i) => i + 1));
  for (const { chapter, board, campaign, navigation } of chapters) {
    assert.equal(campaign.levels.length, chapter.last - chapter.first + 1);
    assert.equal(new Set(campaign.levels.map((m: Mission) => m.runnerNode)).size, campaign.levels.length, `${chapter.country}: distinct spawns`);
    assert.equal(campaign.configHash, hashOf(ECONOMY), "Regenerate campaign after tuning changes");
    assert.equal(campaign.geometryHash, hashOf([board.land, board.borders, board.nodes, board.links]));
    for (const mission of campaign.levels as Mission[]) {
      const tier = ECONOMY.campaignPlan.find((t) => mission.number >= t.levels[0] && mission.number <= t.levels[1])!;
      assert.deepEqual(mission.recommended.map(({ id, step }) => [id, step]), tier.roster.map(([id, step]) => [id, step]), `${mission.id}: roster`);
      assert.equal(mission.runnerSpeed, ECONOMY.opponents[mission.number - 1].speedKmh);
      const p = newPlayer();
      p.unlocked = ECONOMY.levelCount;
      if (mission.recommended.length === 4) { p.deploymentSlots = 4; p.selection.push(null); }
      mission.recommended.forEach(({ id, step }) => (p.squads[id] = { step, training: null }));
      const attempt = createMission(board, mission, p, mission.recommended.map((x) => x.id), 0, navigation);
      assert.equal(attempt.game.outcome.kind, "playing");
      const replay = replayAttempt(board, { ...attempt, moves: mission.witness }, navigation);
      assert(replay.won, mission.id);
      assert.equal(mission.verification!.moves, replay.ordersUsed);
      assert(replay.ordersUsed >= tier.moves[0] && replay.ordersUsed <= tier.moves[1], `${mission.id}: ${replay.ordersUsed} moves outside ${tier.moves}`);
      if (tier.basicMustFail) assert.equal(mission.verification!.basicWitnessWins, false, `${mission.id}: needs its specialists`);
    }
  }
  // The opening stretch is gentle: patrol-only, two-move wins, slow fugitives.
  for (const mission of all.slice(0, 8)) {
    assert.equal(mission.witness.length, 2, mission.id);
    assert(mission.verification!.basicWitnessWins, `${mission.id}: basic patrols can win`);
    assert(mission.runnerSpeed <= 62);
  }
  for (let i = 1; i < all.length; i++) assert(all[i].runnerSpeed > all[i - 1].runnerSpeed, "Speeds rise level by level");
});
test("rewards fund the Academy lesson without leaving far more money than the Academy can absorb", () => {
  const allTraining = ECONOMY.upgradeCosts.reduce((a, b) => a + b, 0);
  const earned = (through: number, moves: number) =>
    Array.from({ length: through }, (_, i) => rewardFor(i + 1, moves)).reduce((a, b) => a + b, 0);
  const rapid = ECONOMY.catalog.rapid, helicopter = ECONOMY.catalog.helicopter;
  // Slowest wins before the lesson still cover the recruit and first upgrade.
  assert(earned(rapid.unlock - 1, 15) >= rapid.price + ECONOMY.upgradeCosts[0]);
  // Even perfect play through India stays within 30% of everything India can buy.
  const spendableInIndia = rapid.price + helicopter.price + allTraining * 2 + ECONOMY.fourthSlot.price;
  assert(earned(15, 2) <= spendableInIndia * 1.3, `${earned(15, 2)} coins vs ${spendableInIndia} spendable`);
  // Two-move-tier play through India still affords the fourth slot by its unlock.
  assert(earned(ECONOMY.fourthSlot.unlock, 2) >= rapid.price + helicopter.price + ECONOMY.fourthSlot.price);
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
