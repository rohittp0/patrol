// Real UI and Meta SDK; intercepted uploads never create synthetic conversions.
async basePage=>{
 const origin=new URL(basePage.url()).origin, local=origin.includes('localhost');
 const context=await basePage.context().browser().newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'});
 const page=await context.newPage(), events=[], checks=[], errors=[];
 const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
 const count=name=>events.filter(e=>e.ev===name).length;
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*posthog.com/**',r=>r.abort());
 await context.route('https://www.facebook.com/**',r=>{
  const request=r.request(),url=new URL(request.url()),params=new URLSearchParams(url.search);
  for(const [k,v]of new URLSearchParams(request.postData()||''))params.set(k,v);
  if(/^\/tr\/?$/.test(url.pathname)&&params.has('ev'))events.push(Object.fromEntries(params));
  return r.fulfill({status:200,body:''});
 });
 const move=async order=>{
  await page.locator(`[data-action="select-squad"][data-squad="${order.squad}"]`).click();
  const post=page.locator(`[data-border="${order.border}"]`);
  for(let i=0;i<4;i++){
   const box=await post.boundingBox(),dock=await page.locator('.squad-dock').boundingBox();
   if(box&&box.x>0&&box.x+box.width<390&&box.y>85&&box.y+box.height<dock.y)break;
   await page.mouse.move(150,350);await page.mouse.wheel(0,250);
  }
  await post.click();await page.locator('[data-action="deploy"]').click();
  await page.waitForFunction(()=>document.querySelector('.capture-moment')||document.querySelector('#journey')?.textContent?.includes('Time paused'));
 };
 try{
  await page.goto(origin+'/?telemetry_debug=1'+(local?'&local=1':''),{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="choose"][data-level="1"]').waitFor();
  await page.waitForFunction(()=>window.fbq?.callMethod);
  await page.locator('.base-shortcuts [data-action="academy"]').click();
  await page.locator('[data-action="purchase"][data-id="rapid"]').evaluate(el=>el.disabled=false);
  await page.locator('[data-action="purchase"][data-id="rapid"]').click();
  await page.locator('.toast.visible').waitFor();
  check(count('FirstSquadPurchased')===0,'Rejected locked purchase emits no activation conversion');
  await page.locator('.bottom-nav [data-action="home"]').click();
  const levels=await page.evaluate(async()=>(await(await fetch('/data/india-campaign.json')).json()).levels);
  await page.locator('[data-action="choose"][data-level="1"]').click();
  for(const id of ['patrol-1','patrol-2','patrol-3'])await page.locator(`[data-action="add-squad"][data-id="${id}"]`).click();
  await page.locator('[data-action="start"]').click();await page.locator('.border-post').first().waitFor();
  for(const order of levels[0].witness)await move(order);
  await page.locator('#result-panel [data-action="next"]').click();
  await page.locator('[data-action="start"]').click();await page.locator('.border-post').first().waitFor();
  for(const order of levels[1].witness)await move(order);
  await page.locator('#result-panel [data-action="next"]').click();
  await page.locator('.roster-footer [data-action="academy"]').click();
  await page.waitForTimeout(500);
  check(count('GameWon')===2&&count('GameCompleted')===2,'Both level completions still reach Meta');
  check(count('FirstSquadPurchased')===0,'Tutorial wins and Academy visits do not emit the purchase conversion');
  const recruitCost=(await page.locator('[data-action="purchase"][data-id="rapid"]').innerText()).match(/\d[\d,]*/)[0].replaceAll(',','');
  await page.locator('[data-action="purchase"][data-id="rapid"]').click();
  if(await page.locator('dialog[open] [data-action="close-modal"]').count())await page.locator('dialog[open] [data-action="close-modal"]').last().click();
  await page.waitForTimeout(500);
  check(count('FirstSquadPurchased')===1&&count('SquadPurchased')===1,'Successful first recruitment emits one activation and one general purchase');
  const first=events.find(e=>e.ev==='FirstSquadPurchased');
  check(first['cd[squad_type]']==='rapid'&&first['cd[hunt_number]']==='3'&&first['cd[amount]']===recruitCost,'Activation contains squad, level and current game-coin cost');
  await page.locator('[data-action="train"][data-id="rapid"]').click();
  await page.locator('[data-action="lesson-done"]').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-action="train"][data-id="rapid"], [data-training="rapid"]').first().waitFor();
  await page.waitForFunction(()=>window.fbq?.callMethod);
  await page.waitForTimeout(500);
  check(count('FirstSquadPurchased')===1,'Training, rerendering and refresh never repeat activation');
  if(local){
   await page.evaluate(()=>{
    const journal=JSON.parse(localStorage.getItem('patrol:outbox:v1'));
    journal.confirmed.player.unlocked=6;journal.confirmed.player.wallet=10000;
    journal.confirmed.player.firstPurchase=false; // Legacy owned-squad save.
    journal.confirmed.active=null;journal.pending=[];
    localStorage.setItem('patrol:outbox:v1',JSON.stringify(journal));
    localStorage.setItem('patrol:progress:v2',JSON.stringify({uid:journal.uid,progress:journal.confirmed}));
   });
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('[data-action="purchase"][data-id="helicopter"]').click();
   await page.waitForFunction(()=>window.fbq?.callMethod);
   await page.waitForTimeout(500);
   check(count('SquadPurchased')===2&&count('FirstSquadPurchased')===1,'Later specialist recruitment does not repeat the first-purchase conversion');
  }
  check(errors.length===0,'No browser errors');
  return {checks:checks.length,passed:checks,firstPurchaseConversions:count('FirstSquadPurchased'),levelWins:count('GameWon')};
 }finally{await context.close();}
}
