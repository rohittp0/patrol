// One desktop Chromium touch-emulation sample; not physical-phone acceptance.
async basePage => {
 const context=await basePage.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();const cdp=await context.newCDPSession(page);
 try{
  await cdp.send('Performance.enable');await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await page.goto('http://localhost:3000/');await page.getByRole('button',{name:'Play Level 1 →',exact:true}).waitFor();
  const coldReadyMs=await page.evaluate(()=>performance.getEntriesByName('patrol-ready')[0].startTime);
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});await page.reload();await page.getByRole('button',{name:'Play Level 1 →',exact:true}).waitFor();
  const warmReadyMs=await page.evaluate(()=>performance.getEntriesByName('patrol-ready')[0].startTime);
  await page.getByRole('button',{name:'Play Level 1 →',exact:true}).click();await page.getByRole('button',{name:'Start level →',exact:true}).click();
  await page.locator('.border-post.guided').waitFor();await page.waitForLoadState('networkidle');
  await page.locator('[data-border="1"]').click();
  const before=(await cdp.send('Performance.getMetrics')).metrics;const metric=(list,name)=>list.find(m=>m.name===name)?.value;
  await page.evaluate(()=>{window.__frames=[];window.__sampling=true;let previous=0;const loop=time=>{if(!window.__sampling)return;if(previous)window.__frames.push(time-previous);previous=time;requestAnimationFrame(loop);};requestAnimationFrame(loop);});
  const start=Date.now();await page.locator('[data-action="move"][data-squad="1"]').click();
  await page.waitForFunction(()=>document.querySelector('#moves-left')?.textContent==='14'&&document.querySelector('#journey')?.textContent?.includes('Thinking time'));
  const moveWallMs=Date.now()-start;
  const samples=await page.evaluate(()=>{window.__sampling=false;return window.__frames;});
  const after=(await cdp.send('Performance.getMetrics')).metrics;
  samples.sort((a,b)=>a-b);const median=samples[Math.floor(samples.length*.5)],p95=samples[Math.floor(samples.length*.95)];
  return {environment:'desktop Chromium, touch emulation, Vite development build, local Firebase emulators',coldReadyMs,warmReadyMs,moveWallMs,medianFrameMs:median,p95FrameMs:p95,medianFps:1000/median,taskCpuMs:(metric(after,'TaskDuration')-metric(before,'TaskDuration'))*1000,heapMiB:metric(after,'JSHeapUsedSize')/1048576};
 }finally{await cdp.detach();await context.close();}
}
