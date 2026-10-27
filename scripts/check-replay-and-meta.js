// Real SDKs and public project config; analytics/replay/Meta uploads intercepted.
async basePage => {
  const origin=new URL(basePage.url()).origin, contexts=[], checks=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const make=async blocked=>{
    const context=await basePage.context().browser().newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'});
    contexts.push(context);
    const page=await context.newPage(), packets=[], meta=[], requests=[], errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',r=>{if(/posthog\.com$|facebook\.(com|net)$/.test(new URL(r.url()).hostname))requests.push(r.url());});
    await context.route('**/*posthog.com/**',async route=>{
      const request=route.request(), path=new URL(request.url()).pathname;
      if(blocked)return route.abort();
      if(request.method()==='POST') {
        const bytes=Array.from(request.postDataBuffer()||[]);
        const decoded=await page.evaluate(async bytes=>{
          const data=new Uint8Array(bytes);
          return data[0]===31 && data[1]===139
            ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
            : new TextDecoder().decode(data);
        },bytes);
        const body=JSON.parse(decoded);packets.push(...(Array.isArray(body)?body:body.batch||[body]));
        return route.fulfill({status:200,contentType:'application/json',body:'{"status":1}'});
      }
      return route.continue();
    });
    await context.route('https://www.facebook.com/**',async route=>{
      const request=route.request(), url=new URL(request.url());
      const values=new URLSearchParams(url.search);
      for(const [key,value] of new URLSearchParams(request.postData()||''))values.set(key,value);
      if(values.has('ev') && /^\/tr\/?$/.test(url.pathname))meta.push(Object.fromEntries(values));
      await route.fulfill({status:200,body:''});
    });
    if(blocked)await context.route('https://connect.facebook.net/**',route=>route.abort());
    return {page,packets,meta,requests,errors};
  };
  const move=async(page,order)=>{
    await page.locator(`[data-action="select-squad"][data-squad="${order.squad}"]`).click();
    await page.locator(`[data-border="${order.border}"]`).click();
    await page.locator('[data-action="deploy"]').click();
    await page.waitForFunction(()=>document.querySelector('.capture-moment')||document.querySelector('#journey')?.textContent?.includes('Time paused'));
  };
  try {
    if(origin.includes('localhost')) {
    const normal=await make(false);
    await normal.page.goto(origin+'/?local=1',{waitUntil:'domcontentloaded'});
    await normal.page.locator('[data-action="choose"][data-level="1"]').waitFor();
    check(normal.requests.length===0,'Normal development does not load Meta or replay');
    }
    const active=await make(false), {page,packets,meta,requests,errors}=active;
    await page.goto(origin+'/?local=1&telemetry_debug=1',{waitUntil:'domcontentloaded'});
    await page.locator('[data-action="choose"][data-level="1"]').waitFor();
    await page.waitForFunction(()=>window.__PATROL_TELEMETRY__?.ready && window.fbq?.callMethod,null,{timeout:60000});
    await page.locator('[data-action="choose"][data-level="1"]').click();
    for(const id of ['patrol-1','patrol-2','patrol-3'])await page.locator(`[data-action="add-squad"][data-id="${id}"]`).click();
    await page.locator('[data-action="start"]').click();
    await page.locator('.border-post').first().waitFor();
    const levels=await page.evaluate(async()=>(await(await fetch('/data/india-campaign.json')).json()).levels);
    for(const order of levels[0].witness)await move(page,order);
    await page.locator('.reward-earned').waitFor();
    await page.waitForTimeout(12000);
    check(requests.some(url=>/recorder/.test(url)),'Actual PostHog recorder extension loads');
    const snapshots=packets.filter(p=>p.event==='$snapshot');
    check(snapshots.length>0 && snapshots.some(p=>p.properties.$snapshot_data?.length>0),'Actual non-empty session replay snapshots reach transport');
    check(snapshots.every(p=>p.properties.$session_id && p.properties.$window_id),'Replay retains session and window metadata');
    check(meta.filter(p=>p.ev==='PageView').length===1,'Actual Meta PageView is delivered once');
    check(meta.filter(p=>p.ev==='GameStart').length===1,'Meta receives level start');
    check(meta.filter(p=>p.ev==='GameCompleted').length===1 && meta.filter(p=>p.ev==='GameWon').length===1,'Capture sends completion and win once');
    check(meta.some(p=>p.ev==='TutorialCompleted' && p['cd[lesson]']==='field'),'Meta tutorial event identifies the field lesson');
    check(!meta.some(p=>Object.keys(p).some(k=>/cd\[(email|name|uid|attempt_id)\]/.test(k))),'Meta excludes account and save identifiers');
    check(!packets.some(p=>/map_gesture|move_issued|squad_select|post_select/.test(p.event)),'No noisy gameplay events are restored');
    check(errors.length===0,'Real SDK gameplay has no page errors');
    const blocked=await make(true);
    await blocked.page.goto(origin+'/?local=1&telemetry_debug=1',{waitUntil:'domcontentloaded'});
    await blocked.page.locator('[data-action="choose"][data-level="1"]').click();
    for(const id of ['patrol-1','patrol-2','patrol-3'])await blocked.page.locator(`[data-action="add-squad"][data-id="${id}"]`).click();
    await blocked.page.locator('[data-action="start"]').click();
    await blocked.page.locator('.border-post').first().waitFor();
    check(blocked.errors.length===0,'Both blocked providers leave the tutorial playable');
    return {checks:checks.length,passed:checks,replayPackets:snapshots.length,metaEvents:meta.map(p=>p.ev)};
  } finally {for(const context of contexts)await context.close();}
}
