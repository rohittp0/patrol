// Exercise SDK-shaped presentation locally without requesting or sending a survey.
async (basePage) => {
  const context = await basePage.context().browser().newContext({ viewport: { width:390,height:844 }, isMobile:true,hasTouch:true });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  try {
    const assert=(value,message)=>{if(!value)throw new Error(message)};
    const cdp=await context.newCDPSession(page);
    const pickPost=async border=>{
      await page.evaluate(border=>window.__PATROL__.map.revealPost(border),border);
      for(let attempt=0;attempt<4;attempt++) {
        await page.waitForFunction(()=>!window.__PATROL__.map.map.isMoving());
        const hit=await page.locator(`.border-post[data-border="${border}"]`).evaluate(el=>{
          const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,clear:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
        });
        if(hit.clear) {await page.locator(`.border-post[data-border="${border}"]`).click();assert(await page.evaluate(()=>window.__PATROL__.selectedPost)===border,'wrong post selected');return;}
        // Dense country-scale post markers need the same pinch zoom as normal play.
        await cdp.send('Input.synthesizePinchGesture',{x:hit.x,y:hit.y,scaleFactor:1.8,gestureSourceType:'touch'});
      }
      throw new Error(`Post ${border} remained obscured after pinch zoom`);
    };
    await page.goto('http://localhost:3000/patrol/');
    await page.waitForFunction(()=>window.__PATROL__?.game && document.querySelector('#loading').hidden);
    await page.locator('#case-start').click();
    await page.locator('.guide-skip').click();
    assert(await page.locator('#command-menu summary').evaluate(el=>el===document.activeElement),'guide skip focus restoration');
    await page.evaluate(()=>window.__PATROL__.loadLevel('india','browser_check',3));
    await page.locator('#case-start').click();
    const witness=await page.evaluate(()=>window.__PATROL__.game.setup.witness);
    for(const move of witness) {
      await pickPost(move.border);
      await page.locator(`.squad-card[data-squad="${move.squad}"]`).click();
      await page.waitForFunction(()=>!window.__PATROL__.game.activeOrder,null,{timeout:15000});
    }
    await page.waitForFunction(()=>document.querySelector('#result').open);
    assert(await page.evaluate(()=>window.__PATROL_TELEMETRY__.recent.some(packet=>packet.name==='level_end'&&packet.params.hunt_number===4&&packet.params.success===1)),'fourth successful hunt event');
    const addSurvey = () => page.evaluate(()=>{
      const host=document.createElement('div');host.className='PostHogSurvey-mobile-fixture';
      const shadow=host.attachShadow({mode:'open'});
      shadow.innerHTML='<style>.ph-survey{position:fixed;bottom:20px;right:20px;width:400px;background:white;color:black;font-family:sans-serif}.survey-form{padding:24px}.form-cancel{position:absolute;top:8px;right:8px}textarea{width:100%;height:120px}</style><div class="ph-survey"><form class="survey-form"><button type="button" class="form-cancel" aria-label="Dismiss fixture">×</button><h2>How was your hunt?</h2><label>Your feedback<textarea></textarea></label><button class="form-submit" type="button">Send feedback (fixture)</button></form></div>';
      shadow.querySelector('.form-cancel').onclick=()=>shadow.querySelector('.ph-survey').remove();
      document.body.append(host);
    });
    await addSurvey();
    await page.waitForFunction(()=>document.querySelector('.survey-presentation')?.matches(':modal'));
    await page.getByRole('textbox',{name:'Your feedback'}).fill('Local fixture only');
    assert(await page.evaluate(()=>document.querySelector('#result').matches(':modal')),'result should remain under survey');
    await page.screenshot({path:'output/playwright/mobile-survey.png'});
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('.survey-presentation'));
    assert(await page.locator('#result-primary').isVisible(),'dismiss restores result');
    await page.locator('#make-headlines').click();
    await addSurvey();
    await page.waitForFunction(()=>document.querySelector('.survey-presentation')&&!document.querySelector('.survey-presentation').open);
    assert(await page.evaluate(()=>document.querySelector('.poster-dialog').matches(':modal')),'survey preempted newspaper');
    await page.locator('#poster-close').click();
    await page.waitForFunction(()=>document.querySelector('.survey-presentation')?.matches(':modal'));
    await page.setViewportSize({width:568,height:320});
    const fit=await page.locator('.survey-presentation').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight});
    assert(fit,'landscape survey overflows');
    await page.getByRole('button',{name:'Dismiss fixture'}).click();
    await page.waitForFunction(()=>!document.querySelector('.survey-presentation'));
    await page.locator('#result-primary').click(); await page.locator('#case-start').click();
    const selected=await page.evaluate(()=>window.__PATROL__.game.setup.witness[0]);
    await pickPost(selected.border);
    const state=await page.evaluate(()=>JSON.stringify(window.__PATROL__.game.snapshot()));
    await addSurvey(); await page.waitForFunction(()=>document.querySelector('.survey-presentation')?.matches(':modal'));
    await page.getByRole('textbox',{name:'Your feedback'}).press('1');
    assert(await page.evaluate(()=>JSON.stringify(window.__PATROL__.game.snapshot()))===state,'survey keyboard issued a game move');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('.survey-presentation'));
    assert(await page.evaluate(()=>window.__PATROL__.selectedPost)===selected.border,'survey Escape cleared game selection');
    return {passed:['guided skip focus','real fourth-hunt success event','survey above native result','editable survey','Escape SDK dismissal','queue behind newspaper','resume queued survey','short landscape fit','dismissal restores result','survey keyboard leaves playing game unchanged','Escape preserves selected post'],externalSurveySubmissions:0};
  } catch(error) {await page.screenshot({path:'output/playwright/survey-failure.png'});throw error;}
  finally {await context.close();}
}
