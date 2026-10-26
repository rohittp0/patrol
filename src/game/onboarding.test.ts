import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { academyLesson, needsFieldLesson, guidedOrder } from "./onboarding";
import {
  applyAction,
  awardWin,
  newPlayer,
  readySquad,
  settleTraining,
  ECONOMY,
} from "./collection";
import { caseForLevel, portraitPath } from "./case-files";
import { createMission, type Mission } from "./missions";
import { Navigation } from "./navigation";
import type { CountryBoard } from "./types";
test("minimum first-two-level rewards fund both guided purchases without replay farming", () => {
  let p = newPlayer();
  assert(needsFieldLesson(p));
  p = awardWin(p, 1, 15).player;
  assert(!needsFieldLesson(p));
  assert.equal(academyLesson(p), null);
  p = awardWin(p, 2, 15).player;
  assert.equal(p.wallet, 75);
  assert.equal(academyLesson(p), "purchase");
  p = applyAction(p, { kind: "purchase", squad: "rapid" }, 1000);
  assert.equal(academyLesson(p), "train");
  p = applyAction(p, { kind: "train", squad: "rapid" }, 1000);
  assert.equal(p.wallet, 30);
  assert.equal(academyLesson(p), "timer");
  assert(!readySquad(p, "rapid", 30999));
  p = settleTraining(p, 31000);
  assert(readySquad(p, "rapid", 31000));
  assert.equal(p.squads.rapid!.step, 1);
  p = applyAction(p, { kind: "tutorial", lesson: "academy" }, 31000);
  assert.equal(academyLesson(p), null);
  for (const level of [4, 6, 10, 15]) {
    p.unlocked = level;
    assert.equal(academyLesson(p), null);
  }
});
test("old saves preserve earned progress and optional tutorial flags survive serialization", () => {
  let p = newPlayer();
  delete p.tutorials;
  p.unlocked = 10;
  assert.equal(academyLesson(p), null);
  p = applyAction(p, { kind: "tutorial", lesson: "field" }, 0);
  assert(!needsFieldLesson(JSON.parse(JSON.stringify(p))));
  assert.equal(p.unlocked, 10);
  p.unlocked = 3;
  p = applyAction(p, { kind: "tutorial", lesson: "academy" }, 0);
  assert.equal(academyLesson(JSON.parse(JSON.stringify(p))), null);
});
test("all 15 accessible case previews have distinct illustrations, sources and exact per-level speed", () => {
  const levels: Mission[] = JSON.parse(
    readFileSync("public/data/india-campaign.json", "utf8"),
  ).levels;
  const ids = new Set<string>();
  for (const l of levels) {
    const file = caseForLevel(l.number);
    assert(!ids.has(file.id));
    ids.add(file.id);
    assert(existsSync(`public/${portraitPath(file)}`));
    assert(file.source.url.startsWith("https://"));
    assert.equal(l.runnerSpeed, ECONOMY.opponents[l.number - 1].speedKmh);
  }
  assert.equal(caseForLevel(1).id, "veerappan");
  assert.throws(() => caseForLevel(16));
});
test("guided first win resumes a correct prefix and never hijacks a different move", () => {
  const board: CountryBoard = JSON.parse(
    readFileSync("public/data/india.json", "utf8"),
  );
  const level: Mission = JSON.parse(
    readFileSync("public/data/india-campaign.json", "utf8"),
  ).levels[0];
  const { game } = createMission(
    board,
    level,
    newPlayer(),
    ["patrol-1", "patrol-2", "patrol-3"],
    0,
    new Navigation(board),
  );
  assert.deepEqual(guidedOrder(game), level.witness[0]);
  for (const order of level.witness) {
    assert(game.issueOrder(order.squad, order.border));
    assert.deepEqual(guidedOrder(game), order);
    game.resolveOrder();
  }
  assert(game.won);
  game.history[0].to = -999;
  assert.equal(guidedOrder(game), null);
});
