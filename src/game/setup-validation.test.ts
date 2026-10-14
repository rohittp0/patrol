import test from "node:test";
import assert from "node:assert/strict";
import { PatrolGame } from "./engine";
import { Navigation, distanceKm } from "./navigation";
import { hasWinWithin } from "./setup-validation";
import type { CountryBoard, Position } from "./types";

function boardFixture(): CountryBoard {
  const points: Position[] = [[0,0],[.4,0],[0,.4],[.2,0],[0,.2],[.8,0],[0,.8],[1,0],[0,1],[.2,.02],[.02,.2],[.8,.02],[.02,.8],[.1,.1],[-.5,-.5]];
  const links = [[0,3],[3,1],[1,5],[5,7],[0,4],[4,2],[2,6],[6,8],...[9,10,11,12,13,14].map((node)=>[0,node])];
  return { id:"test",name:"Test",bounds:[[-1,-1],[2,2]],land:{type:"Polygon",coordinates:[]},regions:[],coasts:[],landExits:[],source:{revision:"fixture",files:{}},setups:[],
    nodes:points.map((p,i)=>({p,kind:i<3?"land":i<7?"portal":i<9?"exit":"post",region:"inside",...(i>=3&&i<7?{border:i-3}:{})})),
    links:links.map(([a,b])=>[a,b,distanceKm(points[a],points[b])]),
    borders:[9,10,11,12,13,14].map((node,i)=>({id:`b${i}`,name:`B${i}`,kind:"internal",regions:["inside"],coordinates:[[i,0],[i,1]],node,post:points[node],lengthKm:100})),
  };
}
function brute(game:PatrolGame,depth:number):boolean {
  if(game.won)return true;
  if(game.outcome.kind!=="playing"||depth===0)return false;
  for(let squad=0;squad<game.squads.length;squad++)for(let border=0;border<game.board.borders.length;border++){
    const branch=game.fork(); if(!branch.issueOrder(squad,border))continue;branch.resolveOrder();
    if(brute(branch,depth-1))return true;
  }
  return false;
}

test("two-move proof pruning matches exhaustive simulation, including same-squad relocations",()=>{
  const board=boardFixture(),navigation=new Navigation(board); let wins=0,losses=0;
  for(let a=0;a<6;a++)for(let b=a+1;b<6;b++)for(let runner=0;runner<3;runner++)for(const speed of [30,120,480]){
    const game=new PatrolGame(board,{id:"fixture",runnerNode:runner,squadBorders:[a,b],witness:[]},{squadCount:2,maxOrders:8,runnerSpeedKmh:60,squadSpeedKmh:speed},navigation);
    const before=JSON.stringify(game.snapshot()),expected=brute(game,2);
    assert.equal(hasWinWithin(game,2),expected,`squads ${a},${b}; runner ${runner}; speed ${speed}`);
    assert.equal(JSON.stringify(game.snapshot()),before);
    expected?wins++:losses++;
  }
  assert(wins>0&&losses>0);
});
