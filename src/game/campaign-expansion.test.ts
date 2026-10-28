import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ECONOMY, applyAction, awardWin, newPlayer, slotCount, chapterForLevel } from "./collection";
import { advanceProgress, initialProgress, type PlayerProgress, type ProgressMutation } from "./player-progress";
import { createMission, replayAttempt, type Mission } from "./missions";
import { Navigation } from "./navigation";
import type { CountryBoard } from "./types";
const read = (name: string) => JSON.parse(readFileSync(`public/data/${name}.json`, "utf8"));
const india: CountryBoard = read("india"), usa: CountryBoard = read("usa");
const manifests = [read("india-campaign"), read("usa-campaign")];
const levels: Mission[] = manifests.flatMap(c => c.levels);
const worlds = { india: { board: india, navigation: new Navigation(india) }, usa: { board: usa, navigation: new Navigation(usa) } };
const worldForLevel = (level: number) => worlds[chapterForLevel(level).country];
function change(state: PlayerProgress, input: Omit<ProgressMutation, "revision" | "actionId">) {
  return advanceProgress(state, { ...input, revision: state.player.revision, actionId: crypto.randomUUID() }, worldForLevel, levels, 1000);
}
test("fourth slot is a one-time Level 15 purchase, with no fifth slot or forced full roster", () => {
  let player = newPlayer(); player.wallet = 1000;
  assert.equal(slotCount(player), 3);
  assert.throws(() => applyAction(player, { kind: "buy-slot" }, 0), /Level 15/);
  player.unlocked = 15;
  const short = { ...player, wallet: ECONOMY.fourthSlot.price - 1 };
  assert.throws(() => applyAction(short, { kind: "buy-slot" }, 0), /money/);
  const purchased = applyAction(player, { kind: "buy-slot" }, 0);
  assert.equal(purchased.wallet, 1000 - ECONOMY.fourthSlot.price);
  assert.equal(purchased.revision, player.revision + 1);
  assert.equal(purchased.firstPurchase, false, "Slot purchase is not the first specialist conversion");
  assert.equal(slotCount(purchased), 4);
  assert.deepEqual(purchased.selection, [...player.selection, null]);
  assert.throws(() => applyAction(purchased, { kind: "buy-slot" }, 0), /owned/);
  const empty = applyAction(purchased, { kind: "selection", selection: [null, null, null, null] }, 0);
  assert.equal(empty.selection.length, 4);
  assert.throws(() => applyAction(purchased, { kind: "selection", selection: [null,null,null,null,null] }, 0), /roster/);
  assert.deepEqual(ECONOMY.futureSlots, []);
});
test("minimum India rewards fund all specialist upgrades plus the fourth slot", () => {
  let player = newPlayer();
  for (let level = 1; level <= 15; level++) player = awardWin(player, level, ECONOMY.maxMoves).player;
  const allUpgrades = Object.values(ECONOMY.catalog).reduce((cost, squad) => cost + squad.price + ECONOMY.upgradeCosts.reduce((a,b)=>a+b,0), 0);
  assert(player.wallet >= allUpgrades + ECONOMY.fourthSlot.price);
  assert.equal(player.unlocked, 16);
});
test("legacy India completion unlocks USA once without changing money, training, results or active pursuit", () => {
  const old = initialProgress(); old.player.unlocked = 15; old.player.wallet = 780;
  old.player.results["15"] = { bestMoves: 7, paid: 240 };
  old.player.squads.rapid = { step: 3, training: { step: 4, readyAt: 999999 } };
  const migrated = change(old, { op: "action", action: { kind: "extend-campaign" } });
  assert.equal(migrated.player.unlocked, 16);
  assert.equal(migrated.player.wallet, old.player.wallet);
  assert.deepEqual(migrated.player.results, old.player.results);
  assert.deepEqual(migrated.player.squads, old.player.squads);
  assert.equal(migrated.player.deploymentSlots, undefined);
  assert.equal(old.player.unlocked, 15);
  assert.throws(() => change(migrated, { op: "action", action: { kind: "extend-campaign" } }));
  const active = change(old, { op: "start", level: 1, selection: ["patrol-1","patrol-2","patrol-3"] });
  delete active.active!.country; // Exact pre-expansion attempt format.
  const extended = change(active, { op: "action", action: { kind: "extend-campaign" } });
  assert.deepEqual(extended.active, active.active);
  assert.throws(() => change(extended, { op: "action", action: { kind: "buy-slot" } }), /saved level/);
  const finished = change(extended, { op: "finish", attemptId: active.active!.id, moves: levels[0].witness });
  assert.equal(finished.active, null);
});
test("all USA levels replay verified wins on their own map, preserve global numbers, and require stronger same-route responses", () => {
  const campaign = manifests[1];
  assert.deepEqual(levels.map(l=>l.number), Array.from({length:25},(_,i)=>i+1));
  assert.equal(campaign.levels.length, 10);
  assert.equal(new Set(campaign.levels.map((m:Mission)=>m.runnerNode)).size, 10);
  assert.equal(campaign.configHash, createHash("sha256").update(JSON.stringify(ECONOMY)).digest("hex"));
  assert.equal(campaign.geometryHash, createHash("sha256").update(JSON.stringify([usa.land,usa.borders,usa.nodes,usa.links])).digest("hex"));
  let speed = levels[14].runnerSpeed;
  for (const mission of campaign.levels as Mission[]) {
    assert(mission.runnerSpeed > speed); speed = mission.runnerSpeed;
    let player = newPlayer(); player.unlocked = 25; player.wallet = 1000;
    player = applyAction(player, { kind:"buy-slot" }, 0);
    mission.recommended.forEach(({id,step})=>player.squads[id]={step,training:null});
    const roster = mission.recommended.map(s=>s.id);
    const state = change({ ...initialProgress(), player }, {op:"start",level:mission.number,selection:roster});
    assert.equal(state.active!.country, "usa");
    assert.equal(state.active!.selection.length, 4);
    const replay = replayAttempt(usa, {...state.active!,moves:mission.witness},worlds.usa.navigation);
    assert(replay.won,mission.id);
    assert.equal(replay.ordersUsed,mission.verification!.moves);
    assert(replay.ordersUsed >= 3 && replay.ordersUsed <= ECONOMY.maxMoves);
    const basicPlayer = newPlayer(); basicPlayer.unlocked=25; basicPlayer.deploymentSlots=4; basicPlayer.selection.push(null);
    const basic = createMission(usa,mission,basicPlayer,["patrol-1","patrol-2","patrol-3",null],0,worlds.usa.navigation).game;
    for (const move of mission.witness) { if(!basic.issueOrder(move.squad,move.border))break; basic.resolveOrder(); }
    assert.equal(basic.won,false,mission.id);
    assert.equal(mission.verification!.basicWitnessWins,basic.won);
    const lower = structuredClone(player);
    for (const squad of Object.values(lower.squads)) if(squad) squad.step=Math.max(0,squad.step-1);
    const weaker=createMission(usa,mission,lower,roster,0,worlds.usa.navigation).game;
    for (const move of mission.witness) { if(!weaker.issueOrder(move.squad,move.border))break; weaker.resolveOrder(); }
    assert.equal(mission.verification!.weakerWitnessMoves,weaker.won?weaker.ordersUsed:null);
    assert.throws(()=>createMission(india,mission,player,roster,0),/another country/);
    const saved = change(state,{op:"save",attemptId:state.active!.id,moves:mission.witness.slice(0,1)});
    const loaded = JSON.parse(JSON.stringify(saved));
    const finished = change(loaded,{op:"finish",attemptId:state.active!.id,moves:mission.witness});
    assert.equal(finished.active,null);
    assert.equal(finished.player.unlocked,25);
    assert(finished.player.results[String(mission.number)]);
  }
});
