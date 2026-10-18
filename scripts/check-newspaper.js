// Playwright CLI callback. Run against npm run dev in an isolated CLI session.
async (basePage) => {
  const context = await basePage.context().browser().newContext({ viewport: { width:390, height:844 }, isMobile:true, hasTouch:true });
  const page = await context.newPage();
  // Concurrent repo edits must not reload an isolated fixture halfway through
  // native-share/download checks. This only blocks the dev server HMR socket.
  await page.routeWebSocket('**', socket => socket.close());
  const passed = [], errors = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  page.on('pageerror', error => errors.push(error.message));
  const ready = () => page.waitForFunction(() => window.__PATROL__?.game && document.querySelector('#loading').hidden);
  const exported = () => page.waitForFunction(() => document.querySelector('#poster-share')?.disabled === false);
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  try {
    await page.goto('http://localhost:3000/patrol/'); await ready();
    if (await page.locator('#case-start').isVisible()) await page.locator('#case-start').click();
    await page.evaluate(() => window.__PATROL__.loadLevel('india','newspaper_qa')); await ready();
    if (await page.locator('#case-start').isVisible()) await page.locator('#case-start').click();
    // A developer-only app fixture reaches an ordinary result; editor actions
    // below use actual controls and preserve the same report/profile lifecycle.
    await page.evaluate(() => {
      const app = window.__PATROL__;
      app.startSetup(app.validSetups[0]);
      for (const move of app.game.setup.witness) { app.game.issueOrder(move.squad, move.border); app.game.resolveOrder(); }
      app.render();
    });
    await page.locator('#make-headlines').click(); await exported();
    await page.evaluate(() => {
      window.__shareCalls = [];
      Object.defineProperty(navigator, 'canShare', { configurable:true, value:() => true });
      Object.defineProperty(navigator, 'share', { configurable:true, value:data => {
        window.__sharedFile = data.files[0];
        window.__shareCalls.push({ active:navigator.userActivation.isActive, name:data.files[0].name, size:data.files[0].size });
        return Promise.resolve();
      } });
      const original = URL.createObjectURL;
      URL.createObjectURL = function(blob) { if (blob instanceof File && blob.type === 'image/png') window.__downloadFile = blob; return original.call(this, blob); };
    });
    await page.locator('#player-name').fill('Officer Phone'); await exported();
    const photo = await page.evaluate(() => {
      const c=document.createElement('canvas'); c.width=c.height=400; const x=c.getContext('2d');
      x.fillStyle='#e8bc79';x.fillRect(0,0,400,400); x.fillStyle='#164957';x.fillRect(0,0,100,400);
      x.fillStyle='#304327';x.beginPath();x.arc(230,190,100,0,Math.PI*2);x.fill();
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#player-photo').setInputFiles({ name:'generated-pattern.png', mimeType:'image/png', buffer:Buffer.from(photo,'base64') });
    await page.locator('#crop-editor').waitFor({ state:'visible' }); await exported();
    const originalCrop = await page.locator('#head-crop').evaluate(c => c.toDataURL());
    await page.locator('#photo-zoom').fill('1.6'); await page.locator('#photo-zoom').dispatchEvent('change'); await exported();
    await page.locator('#head-crop').scrollIntoViewIfNeeded();
    const crop = await page.locator('#head-crop').boundingBox();
    await page.mouse.move(crop.x+crop.width/2,crop.y+crop.height/2); await page.mouse.down();
    await page.mouse.move(crop.x+crop.width/2+30,crop.y+crop.height/2+20,{steps:12}); await page.mouse.up(); await exported();
    assert(await page.locator('#head-crop').evaluate(c => c.toDataURL()) !== originalCrop,'crop drag/zoom did not change crop');
    passed.push('generated photo upload, crop drag and zoom');

    for (const [width,height] of [[320,568],[390,844],[844,390],[568,320]]) {
      await page.setViewportSize({width,height}); await frame();
      const failures = await page.evaluate(() => ['.poster-dialog','.poster-toolbar','.poster-export','#poster-share','#poster-download','#poster-close'].flatMap(selector => {
        const el=document.querySelector(selector),r=el.getBoundingClientRect();
        return r.x < -1 || r.y < -1 || r.right > innerWidth+1 || r.bottom > innerHeight+1 ? [`${selector}: ${JSON.stringify(r.toJSON())}`] : [];
      }));
      assert(!failures.length,`${width}x${height}: ${failures.join('; ')}`);
      await page.screenshot({path:`output/playwright/newspaper-${width}x${height}.png`});
      passed.push(`newspaper chrome ${width}x${height}`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#player-name').fill('  Officer Latest   Name  '); await exported();
    await page.locator('#poster-share').click();
    assert(await page.evaluate(() => window.__shareCalls.at(-1).active),'native share lost click activation');
    const fileInfo = await page.evaluate(async () => {
      const file=window.__sharedFile, bytes=new DataView(await file.arrayBuffer());
      const bitmap=await createImageBitmap(file), copy=document.createElement('canvas'); copy.width=bitmap.width;copy.height=bitmap.height;
      const x=copy.getContext('2d');x.drawImage(bitmap,0,0); bitmap.close();
      const digest=async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).join(',');
      const live=document.querySelector('#newspaper');
      return { width:bytes.getUint32(16),height:bytes.getUint32(20),type:file.type,name:file.name,size:file.size,
        matches:await digest(x.getImageData(0,0,copy.width,copy.height).data) === await digest(live.getContext('2d').getImageData(0,0,live.width,live.height).data),
        profile:document.querySelector('#player-name').value };
    });
    assert(fileInfo.width===1200 && fileInfo.height===1500 && fileInfo.matches,'shared PNG dimensions/pixels differ from latest preview');
    assert(fileInfo.profile==='Officer Latest Name','blur normalization did not persist');
    passed.push('native share invoked with active user gesture and newest exact 1200x1500 PNG');

    await page.evaluate(() => Object.defineProperty(navigator,'share',{configurable:true,value:() => Promise.reject(new DOMException('Cancelled fixture','AbortError'))}));
    await page.locator('#poster-share').click(); await frame();
    assert(!await page.locator('#share-caption').isVisible(),'cancelled native share opened fallback');
    passed.push('native share cancellation');
    await page.evaluate(() => Object.defineProperty(navigator,'canShare',{configurable:true,value:() => false}));
    const downloadEvent=page.waitForEvent('download'); await page.locator('#poster-share').click(); const download=await downloadEvent;
    assert(download.suggestedFilename().endsWith('-front-page.png'),'fallback download filename');
    assert(await page.locator('#share-caption').isVisible(),'fallback invitation missing');
    assert(await page.evaluate(async () => {
      const a=new Uint8Array(await window.__sharedFile.arrayBuffer()),b=new Uint8Array(await window.__downloadFile.arrayBuffer());
      return a.length===b.length && a.every((value,index) => value===b[index]);
    }),'fallback download differs from latest shared PNG');
    await page.evaluate(() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text => {window.__copied=text;}}}));
    await page.locator('#copy-caption').click();
    assert(await page.evaluate(() => window.__copied===document.querySelector('#poster-caption').value && window.__copied.includes('https://rohittp.com/patrol')),'copied invitation wrong');
    passed.push('unsupported native share downloads exact PNG and copies invitation');

    // Delay one real encode, close/reopen while it is in flight, then release it.
    await page.evaluate(() => {
      window.__realToBlob=HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob=function(callback,...args) {
        if (this.id==='newspaper' && !window.__heldEncode) { window.__heldEncode={canvas:this,callback,args};return; }
        return window.__realToBlob.call(this,callback,...args);
      };
    });
    await page.locator('#player-name').fill('Pending editor'); await page.waitForFunction(() => !!window.__heldEncode);
    await page.locator('#poster-close').click();
    await page.locator('#make-headlines').click();
    await page.evaluate(() => {
      const held=window.__heldEncode;HTMLCanvasElement.prototype.toBlob=window.__realToBlob;
      window.__realToBlob.call(held.canvas,held.callback,...held.args);
    });
    await exported();
    assert(!await page.locator('#crop-editor').isVisible(),'original upload/crop coordinates retained after close');
    assert(await page.locator('#photo-remove').isVisible(),'saved final head crop did not survive reopen');
    assert(await page.locator('#player-photo').inputValue()==='','file input retained original upload');
    passed.push('close/reopen during encode discards stale async result and original upload');
    await page.locator('#poster-close').click();

    // Mirror the installed SDK open-shadow host and its real class names. This
    // only tests presentation coordination; it sends no survey responses.
    await page.evaluate(() => {
      const host=document.createElement('div');host.className='PostHogSurvey-qa-fixture';
      const shadow=host.attachShadow({mode:'open'});
      shadow.innerHTML='<div class="ph-survey"><form class="survey-form"><button type="button" class="form-cancel">×</button><p>How was your patrol?</p><textarea rows="8" aria-label="Playtest feedback"></textarea><button type="button" class="form-submit">Submit</button></form></div>';
      shadow.querySelector('.form-cancel').onclick=() => shadow.querySelector('.ph-survey').remove();
      document.body.append(host);
    });
    await page.locator('.survey-presentation').waitFor({state:'visible'});
    assert(await page.locator('.survey-presentation').evaluate(d=>d.open && d.matches(':modal')),'survey is not modal');
    await page.locator('#make-headlines').click({force:true}).catch(()=>{});
    // Open via fixture because an actual modal correctly makes the board inert.
    await page.evaluate(() => document.querySelector('#make-headlines').click());
    await exported();
    assert(!await page.locator('.survey-presentation').isVisible(),'survey competes with newspaper');
    await page.locator('#poster-close').click();
    await page.locator('.survey-presentation').waitFor({state:'visible'});
    await page.keyboard.press('Escape'); await page.waitForFunction(()=>!document.querySelector('.survey-presentation'));
    passed.push('survey open-shadow host enters modal layer, yields to newspaper, resumes and dismisses through SDK button');
    assert(!errors.length,`page errors: ${errors.join('; ')}`);
    return {checks:passed.length,passed,fileInfo,pageErrors:errors,limits:'Chromium emulation; actual iPhone/Android sharing, software keyboard and device performance unverified'};
  } catch(error) { await page.screenshot({path:'output/playwright/newspaper-failure.png'}); throw new Error(`After ${JSON.stringify(passed)} at ${page.url()} with page errors ${JSON.stringify(errors)}: ${error.message}`); }
  finally { await context.close(); }
}
