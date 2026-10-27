// Firebase emulators + real PostHog SDK. All analytics uploads are intercepted.
async basePage => {
  const context=await basePage.context().browser().newContext({
    userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  });
  const page=await context.newPage(), packets=[], checks=[], errors=[], fixture=Date.now().toString(36);
  let release;
  const gate=new Promise(resolve=>release=resolve);
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/node_modules/.vite/deps/posthog-js.js*',async route=>{await gate;await route.continue();});
  await context.route('https://www.facebook.com/**',route=>route.fulfill({status:200,body:''}));
  await context.route('**/*posthog.com/**',async route=>{
    const request=route.request();
    if(request.method()==='POST' && new URL(request.url()).pathname.includes('/e/')) {
      const bytes=Array.from(request.postDataBuffer()||[]);
      const text=await page.evaluate(async bytes=>{
        const data=new Uint8Array(bytes);
        return data[0]===31 && data[1]===139
          ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
          : new TextDecoder().decode(data);
      },bytes);
      const body=JSON.parse(text);packets.push(...(Array.isArray(body)?body:body.batch||[body]));
    }
    await route.fulfill({status:200,contentType:'application/json',body:'{"status":1,"featureFlags":{}}'});
  });
  const login=async tag=>page.evaluate(async ({tag,fixture})=>{
    const {getAuth,linkWithCredential,GoogleAuthProvider}=await import('/node_modules/.vite/deps/firebase_auth.js');
    const auth=getAuth();
    const jwt=[{alg:'none',typ:'JWT'},{iss:'https://accounts.google.com',aud:'emulator-client',sub:crypto.randomUUID(),email:`${tag}-${fixture}@example.test`,name:`Officer ${tag}`,email_verified:true,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600}]
      .map(v=>btoa(JSON.stringify(v)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')).join('.')+'.';
    await linkWithCredential(auth.currentUser,GoogleAuthProvider.credential(jwt));
  },{tag,fixture});
  try {
    await page.goto(new URL(basePage.url()).origin+'/?telemetry_debug=1');
    await page.locator('[data-action="choose"][data-level="1"]').waitFor();
    await login('first');
    await page.locator('.bottom-nav [data-action="levels"]').click();
    await page.evaluate(async()=>{
      const source=await (await fetch('/src/main.ts')).text();
      const telemetryPath=source.match(/from\s+["']([^"']*telemetry[^"']*)["']/)[1];
      const {measure}=await import(telemetryPath);
      measure('country_prepare',performance.now(),'india');
    });
    await page.locator('[data-action="account"]').click();
    await page.locator('[data-action="sign-out"]').click();
    await page.locator('[data-action="choose"][data-level="1"]').waitFor();
    release();
    await page.waitForFunction(()=>window.__PATROL_TELEMETRY__?.ready);
    await page.waitForTimeout(4000);
    const guest=packets.find(p=>p.event==='app_open');
    check(guest?.properties.signed_in===false && !guest.properties.email && !guest.properties.name,'Guest entry omits personal details even when queued across sign-in');
    const signed=packets.find(p=>p.event==='page_view' && p.properties.screen==='levels');
    check(signed?.properties.email===`first-${fixture}@example.test` && signed.properties.name==='Officer first','Signed-in screen event includes Firebase email and display name');
    check(signed.properties.email_verified===true && signed.properties.auth_provider==='google.com','Verification and provider are retained as event properties');
    const timing=packets.find(p=>p.event==='country_prepare');
    check(timing?.properties.email===`first-${fixture}@example.test`,'Queued timing retains the account present when measured');
    const homes=packets.filter(p=>p.event==='page_view' && p.properties.screen==='home');
    check(homes.at(-1)?.properties.signed_in===false && !homes.at(-1).properties.email && !homes.at(-1).properties.name,'Events after sign-out clear the prior account details');
    await login('second');
    await page.locator('.bottom-nav [data-action="levels"]').click();
    await page.waitForTimeout(4000);
    const latest=packets.filter(p=>p.event==='page_view' && p.properties.screen==='levels').at(-1);
    check(latest?.properties.email===`second-${fixture}@example.test` && latest.properties.name==='Officer second','Next account replaces prior account properties');
    await page.reload();
    await page.locator('.level-card').first().waitFor();
    await page.waitForFunction(()=>window.__PATROL_TELEMETRY__?.ready);
    await page.waitForTimeout(4000);
    const restored=packets.filter(p=>p.event==='app_open').at(-1);
    check(restored?.properties.email===`second-${fixture}@example.test` && restored.properties.name==='Officer second','App entry waits for restored Auth details after refresh');
    check(packets.every(p=>p.properties.$process_person_profile===false && p.properties.$is_identified===false),'Events remain personless without identify calls');
    check(!packets.some(p=>Object.keys(p.properties).some(k=>/uid|tokenid|accessToken|photoURL|attempt_id/.test(k))),'UIDs, credentials, photos and save IDs remain excluded');
    check(errors.length===0,'No browser errors');
    return {checks:checks.length,passed:checks,interceptedPackets:packets.length};
  } finally {release();await context.close();}
}
