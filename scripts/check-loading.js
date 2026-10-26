// Verify the chase paints and animates even while the entry script is blocked.
async basePage => {
 const origin=new URL(basePage.url()).origin;
 const context=await basePage.context().browser().newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 let release;const gate=new Promise(resolve=>release=resolve),checks=[];
 const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)};
 try {
  await page.route(/(?:\/src\/main\.ts|\/assets\/index-[^/]+\.js)(?:\?|$)/,async route=>{await gate;await route.continue()});
  await page.goto(origin+(new URL(origin).hostname==='localhost'?'/?local=1':'/'),{waitUntil:'commit'});
  await page.locator('.boot-screen').waitFor({state:'visible'});
  check(await page.locator('#loading-stage').innerText()==='Rounding up your squads…','Loading screen paints before application JavaScript');
  await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.boot-actor')).offsetDistance)>15);
  check(true,'Chase animation moves without application JavaScript');
  await page.screenshot({path:'output/playwright/game-ui-loading.png'});
  await page.emulateMedia({reducedMotion:'reduce'});
  check(await page.locator('.boot-actor').first().evaluate(el=>getComputedStyle(el).animationName)==='none','Reduced motion shows a static scene');
  release();await page.locator('[data-action="choose"][data-level="1"]').waitFor();
  check(await page.locator('.boot-screen').count()===0,'Game replaces loader immediately when ready');
  const duplicateFetches=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.endsWith('/data/india.json')).length);
  check(duplicateFetches===1,'Map preload is reused instead of downloading twice');
  return {checks:checks.length,passed:checks};
 }finally{release();await context.close();}
}
