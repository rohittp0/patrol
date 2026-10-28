import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Navigation, distanceKm } from "../src/game/navigation";
import { PatrolGame } from "../src/game/engine";
import { ECONOMY, newPlayer } from "../src/game/collection";
import { createMission, type Mission } from "../src/game/missions";
import type { CountryBoard } from "../src/game/types";
const board: CountryBoard = JSON.parse(readFileSync("public/data/usa.json", "utf8"));
const nav = new Navigation(board);
const tuning = ECONOMY.usaAuthoring;
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const titles = ["Across the Atlantic", "Prairie pursuit", "The northern corridor", "Hold the crossroads", "Beyond the bay", "The long detour", "High-country watch", "Ridge and reserve", "Seal the frontier", "America: command test"];
const briefs = ["A new patrol zone. Bring a fourth squad to cover the wider network.", "The fugitive crosses open country quickly. Train for the response.", "Watch the northern land exits and leave a squad guarding behind you.", "Use four squads to close different parts of the net.", "The coast helps, but every inland exit still needs coverage.", "Preview the whole route before moving a stationed Marksman.", "Rapid Action must reach the next post before the fugitive crosses.", "Helicopter deployments expire. Keep another squad ready to close the gap.", "Guard the frontier and use firing range to cover a second route.", "Your final USA assignment. Combine your four strongest units."];
function solve(game: PatrolGame, targets: number[], depthLimit = tuning.depth) {
  let beam = [{ game, moves: [] as Mission["witness"], score: 0 }];
  const seen = new Set<string>();
  for (let depth = 0; depth < depthLimit; depth++) {
    const next: typeof beam = [];
    for (const state of beam) {
      const nearest = board.borders.map((b, index) => ({ index, d: distanceKm(b.post, state.game.runner.position) })).sort((a,b)=>a.d-b.d).slice(0,tuning.nearestPosts).map(x=>x.index);
      for (let squad=0;squad<game.squads.length;squad++) for (const border of new Set([...targets,...nearest])) {
        const branch=state.game.fork();
        if(!branch.issueOrder(squad,border))continue;
        branch.resolveOrder();
        const moves=[...state.moves,{squad,border}];
        if(branch.won)return moves;
        if(branch.outcome.kind!=="playing")continue;
        const key=JSON.stringify([branch.squads.map(s=>[s.border,s.guardLeft]),branch.runner.position.map(v=>Math.round(v*10000))]);
        if(seen.has(key))continue;seen.add(key);
        const remaining = branch.runner.route.length ? distanceKm(branch.runner.position, branch.runner.route.at(-1)!.position) : 0;
        next.push({game:branch,moves,score:remaining});
      }
    }
    beam=next.sort((a,b)=>b.score-a.score).slice(0,tuning.beam);
    if(!beam.length)return null;
  }
  return null;
}
const missions: Mission[]=[];
for(let i=0;i<10;i++) {
 const number=16+i;
 const step=ECONOMY.upgradeCosts.length;
 const recommended:Mission["recommended"]=[{id:"marksman",step},{id:"rapid",step},{id:"helicopter",step},{id:"patrol-1",step:0}];
 const player=newPlayer();player.unlocked=25;player.deploymentSlots=4;player.selection.push(null);
 recommended.forEach(({id,step})=>player.squads[id]={step,training:null});
 let found:Mission|null=null;
 for(let offset=0;offset<6&&!found;offset++) {
  const base=board.setups[(i+offset)%6];
  const region=board.nodes[base.runnerNode].region;
  const spawns=[base.runnerNode,...board.nodes.map((n,index)=>({n,index})).filter(({n,index})=>n.kind==="land"&&n.region===region&&index!==base.runnerNode).sort((a,b)=>distanceKm(a.n.p,board.nodes[base.runnerNode].p)-distanceKm(b.n.p,board.nodes[base.runnerNode].p)).map(x=>x.index)];
  for(const spawn of spawns.slice(0,tuning.spawnsPerRegion)) {
   if(missions.some(m=>m.runnerNode===spawn))continue;
   const posts=base.squadBorders.slice(0,3);
   const extra=board.borders.map((b,index)=>({index,d:distanceKm(b.post,board.nodes[spawn].p)})).filter(x=>!posts.includes(x.index)&&x.d>tuning.fourthPostClearanceKm).sort((a,b)=>a.d-b.d)[0];
   posts.push(extra.index);
   const mission:Mission={country:"usa",number,id:`usa-v2-${number}`,title:titles[i],briefing:briefs[i],runnerNode:spawn,posts,runnerSpeed:ECONOMY.opponents[number-1].speedKmh,recommended,witness:[]};
   const {game}=createMission(board,mission,player,recommended.map(r=>r.id),0,nav);
   if(game.outcome.kind!=="playing")continue;
   const targets=base.witness.map(m=>m.border);
   const witness=solve(game,targets);
   if(!witness||witness.length<3)continue;
   mission.witness=witness;
   const weak=newPlayer();weak.unlocked=25;weak.deploymentSlots=4;weak.selection.push(null);
   const basic=createMission(board,mission,weak,["patrol-1","patrol-2","patrol-3",null],0,nav).game;
   for(const move of witness){if(!basic.issueOrder(move.squad,move.border))break;basic.resolveOrder();}
   const lower=structuredClone(player);Object.values(lower.squads).forEach(u=>{if(u)u.step=Math.max(0,u.step-1);});
   const weaker=createMission(board,mission,lower,recommended.map(r=>r.id),0,nav).game;
   for(const move of witness){if(!weaker.issueOrder(move.squad,move.border))break;weaker.resolveOrder();}
   mission.verification={moves:witness.length,basicWitnessWins:basic.won,weakerWitnessMoves:weaker.won?weaker.ordersUsed:null};
   found=mission;break;
  }
 }
 if(!found)throw new Error(`No verified USA level ${number}`);
 missions.push(found);console.log(`${number}: ${found.witness.length} moves, spawn ${found.runnerNode}, ranks ${recommended.map(x=>x.step)}`);
 writeFileSync("/tmp/patrol-usa-generation-progress.json",JSON.stringify(missions));
}
writeFileSync("public/data/usa-campaign.json",JSON.stringify({version:2,country:"usa",geometryHash:hash([board.land,board.borders,board.nodes,board.links]),configHash:hash(ECONOMY),levels:missions}));
// Preserve every India spawn, first three posts and witness. Add an optional,
// distant fourth deployment post for returning players with the purchased slot.
const india=JSON.parse(readFileSync("public/data/india.json","utf8"));
const existing=JSON.parse(readFileSync("public/data/india-campaign.json","utf8"));
for(const m of existing.levels){m.country="india";if(m.posts.length<4){const extra=india.borders.map((b:any,index:number)=>({index,d:distanceKm(b.post,india.nodes[m.runnerNode].p)})).filter((x:any)=>!m.posts.includes(x.index)).sort((a:any,b:any)=>b.d-a.d)[0];m.posts.push(extra.index);}}
existing.configHash=hash(ECONOMY);
writeFileSync("public/data/india-campaign.json",JSON.stringify(existing));
