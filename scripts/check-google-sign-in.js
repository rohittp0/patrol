// Exercise the real Firebase popup only as far as Google's account screen.
// No credentials are entered, and the isolated guest context is always closed.
async basePage => {
  const context=await basePage.context().browser().newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();let redirectUri=null;
  context.on('request',request=>{
    const url=new URL(request.url());
    if(url.hostname==='accounts.google.com' && url.searchParams.has('redirect_uri')) redirectUri=url.searchParams.get('redirect_uri');
  });
  await page.route(/https:\/\/[^/]*(?:posthog|facebook)[^/]*\//,route=>route.abort());
  try {
    await page.goto(new URL(basePage.url()).origin+'/');
    await page.locator('[data-action="account"]').waitFor();
    await page.locator('[data-action="account"]').click();
    const opened=page.waitForEvent('popup');
    await page.locator('[data-action="google"]').click();
    const popup=await opened;
    await popup.waitForURL(url=>url.hostname==='accounts.google.com');
    await popup.waitForFunction(()=>!!document.querySelector('input[type="email"]') || /redirect_uri_mismatch|OAuth 2.0 policy|Choose an account|Email or phone|Access blocked/i.test(document.body?.innerText||''));
    const body=await popup.locator('body').innerText();
    const report={redirectUri,redirectMismatch:/redirect_uri_mismatch|OAuth 2.0 policy/i.test(body),accountScreen:!!await popup.locator('input[type="email"]').count() || /Choose an account|Email or phone/i.test(body)};
    if(report.redirectUri!=='https://patrol-daac9.firebaseapp.com/__/auth/handler' || report.redirectMismatch || !report.accountScreen) throw new Error(JSON.stringify(report));
    await popup.close();
    await page.waitForFunction(()=>!document.querySelector('#app[aria-busy="true"]'));
    return {...report,cancelKeepsGame:await page.locator('[data-action="choose"]').count()>0};
  } catch(error) {
    const screens=[];
    for(const screen of context.pages()) {const url=new URL(screen.url());screens.push({host:url.hostname,path:url.pathname,text:(await screen.locator('body').innerText().catch(()=>'' )).slice(0,1200)});}
    throw new Error(JSON.stringify({error:String(error),redirectUri,screens}));
  } finally {await context.close();}
}
