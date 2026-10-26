import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import { CASE_FILES, caseForChallenge, portraitPath } from "./case-files";
import { captureReport } from "./capture-report";
import { PatrolGame, rulesForLevel } from "./engine";
import { LandRoute } from "./land-route";
import { Navigation } from "./navigation";
import { newspaperCopy, playerName } from "../poster-content";
import type { CountryBoard } from "./types";
import { setupCuration, validSetupCuration } from "./setup-curation";
import { setupRulesSignature } from "./difficulty";

const board = (id: string): CountryBoard => JSON.parse(readFileSync(`public/data/${id}.json`, "utf8"));

test("every campaign hunt has a distinct illustrated, sourced historical case", () => {
  const ids = new Set<string>();
  for (const level of CONFIG.levels) {
    assert.equal(CASE_FILES[level.id].length, board(level.id).setups.length);
    for (let i = 0; i < CONFIG.setups.poolSize; i++) {
      const file = caseForChallenge(level.id, i);
      assert(!ids.has(file.id)); ids.add(file.id);
      assert(existsSync(`public/${portraitPath(file)}`));
      assert.equal(new URL(file.source.url).protocol, "https:");
      assert(file.intro && file.ending && file.endingDate);
    }
  }
  assert.throws(() => caseForChallenge("usa", CONFIG.setups.poolSize));
});

for (const level of CONFIG.levels) {
  const country = board(level.id);
  test(`${level.name}: enclosure contraction exactly matches full graph connectivity`, () => {
    const navigation = new Navigation(country);
    const samples = country.setups.flatMap((setup) => [new Set(setup.squadBorders), new Set([...setup.squadBorders, ...setup.witness.map((move) => move.border)])]);
    let seed = 107;
    for (let i = 0; i < 100; i++) {
      const secured = new Set<number>();
      for (let j = 0; j < country.borders.length; j++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; if (seed % 5 === 0) secured.add(j); }
      samples.push(secured);
    }
    for (const secured of samples) {
      const seen = new Set<number>(), queue: number[] = [];
      country.nodes.forEach((node, index) => { if (node.kind === "exit" && navigation.allowed(index, secured, true)) { seen.add(index); queue.push(index); } });
      for (let head = 0; head < queue.length; head++) for (const [next] of navigation.neighbors[queue[head]]) if (!seen.has(next) && navigation.allowed(next, secured, true)) { seen.add(next); queue.push(next); }
      const expected = country.nodes.some((node, index) => node.kind === "land" && !seen.has(index));
      assert.equal(navigation.canEnclose(secured), expected, [...secured].join(","));
    }
  });
  test(`${level.name}: newspaper uses the final capture location and actual attempt facts`, () => {
    for (const [index, setup] of country.setups.entries()) {
      const game = new PatrolGame(country, setup, rulesForLevel(level.id, setup.squadBorders.length));
      assert.throws(() => captureReport(game, index, index + 1));
      for (const move of setup.witness) { game.issueOrder(move.squad, move.border); game.resolveOrder(); }
      const report = captureReport(game, index, index + 1);
      const actual = country.regions.filter((region) => new LandRoute(region.geometry).contains(game.runner.position));
      assert(actual.some((region) => report.region.includes(region.name)));
      assert.equal(report.moves, game.ordersUsed); assert.equal(report.squads, setup.squadBorders.length);
      const copy = newspaperCopy(report, "  Officer   Ada  ");
      assert(copy.byline.includes("Officer Ada")); assert(copy.lead.includes(report.region));
      assert(copy.lead.includes(`${report.squads}-squad`)); assert(copy.lead.includes(`${game.ordersUsed} moves`));
      assert(copy.archive.includes(report.file.ending)); assert(copy.share.includes(CONFIG.hosting.productionOrigin));
    }
  });
}

test("poster names have a Unicode-aware limit and a friendly empty fallback", () => {
  assert.equal(playerName(" \n "), "Captain You");
  assert.equal([...playerName("🚓".repeat(100))].length, CONFIG.poster.maxNameLength);
});

test("USA excludes the Great Lakes from playable land", () => {
  const country = board("usa"), land = new LandRoute(country.land);
  assert(!land.contains([-87, 44])); // Lake Michigan
  assert(land.contains([-89.5, 43])); // Wisconsin mainland

});

test("USA starts span six states with four-border enclosures instead of repeated coastal traps", () => {
  const country = board("usa"), policy = setupCuration("usa");
  const states = country.setups.map((setup) => country.nodes[setup.runnerNode].region);
  assert.equal(new Set(states).size, CONFIG.setups.poolSize);
  assert(!states.includes("us-ca"));
  for (const setup of country.setups) {
    const game = new PatrolGame(country, setup, rulesForLevel("usa"));
    for (const move of setup.witness) { game.issueOrder(move.squad, move.border); game.resolveOrder(); }
    assert(validSetupCuration(game), setup.id);
    let necessary = 0;
    for (const guarded of game.securedBorders) {
      const released = game.securedBorders; released.delete(guarded);
      if (game.navigation.shortestPath([{ node: game.runner.lastLandNode, cost: 0 }], (node) => country.nodes[node].kind === "exit", released, true)) necessary++;
    }
    assert(necessary >= policy.minimumEnclosureBorders, `${setup.id}: too few guards are needed for this trap`);
  }
});


test("hunts keep their own supported squad allocation and allocation-specific proofs", async () => {
  const country = board("india"), first = country.setups[0];
  const fourPosts = [...first.squadBorders];
  for (let border = 0; fourPosts.length < 4; border++) if (!fourPosts.includes(border)) fourPosts.push(border);
  const three = { ...first, squadBorders: fourPosts.slice(0, 3) };
  const four = { ...first, squadBorders: fourPosts };
  assert.equal(new PatrolGame(country, three).squads.length, 3);
  assert.equal(new PatrolGame(country, four).squads.length, 4);
  assert.throws(() => rulesForLevel("india", 2), /Unsupported squad allocation/);
  assert.notEqual(await setupRulesSignature(country, rulesForLevel("india", 3)), await setupRulesSignature(country, rulesForLevel("india", 4)));
  assert.throws(() => new PatrolGame(country, three, rulesForLevel("india", 4)), /squad allocation/);
});
