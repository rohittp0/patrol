import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advancePlayback } from './playback';
import { createMission } from './missions';
import { newPlayer, ECONOMY } from './collection';
import { Navigation } from './navigation';
import type { CountryBoard } from './types';
test('distant destinations do not secretly accelerate the visible fugitive',()=>{
 const board:CountryBoard=JSON.parse(readFileSync('public/data/india.json','utf8'));
 const level=JSON.parse(readFileSync('public/data/india-campaign.json','utf8')).levels[0];
 const nav=new Navigation(board);
 const fresh=()=>createMission(board,level,newPlayer(),['patrol-1','patrol-2','patrol-3'],0,nav).game;
 let compared=0;
 for(let post=0;post<board.borders.length;post++){
  const game=fresh();if(!game.issueOrder(0,post) || !game.activeOrder || game.activeOrder.durationHours<8)continue;
  const seconds=.01;advancePlayback(game,seconds);
  assert(Math.abs(game.history[0].runnerTravelledKm/seconds - level.runnerSpeed*ECONOMY.playbackScale/3600)<.001,`Long order to post ${post+1} changed the runner playback speed`);compared++;
  if(compared===3)break;
 }
 assert(compared>0,'test covers actual long land journeys');
});
