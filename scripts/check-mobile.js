// Run against npm run dev in an isolated Playwright CLI session; see docs/mobile-web.md.
async (basePage) => {
  // Fresh context preserves every existing Patrol save, including the CLI session.
  const context = await basePage.context().browser().newContext({ viewport: { width:390, height:844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const results = [];
  const ready = () => page.waitForFunction(() => window.__PATROL__?.game && document.querySelector('#loading').hidden);
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const startCase = async () => { if (await page.locator('#case-start').isVisible()) await page.locator('#case-start').click(); };
  const checkGeometry = async (name, selectors) => {
    await frame();
    const failures = await page.evaluate(selectors => {
      const failures = [];
      for (const selector of selectors) {
        for (const element of document.querySelectorAll(selector)) {
          if (!element.getClientRects().length) continue;
          const r = element.getBoundingClientRect();
          if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) failures.push(`${selector} out of viewport: ${JSON.stringify(r.toJSON())}`);
        }
      }
      if (document.documentElement.scrollWidth > innerWidth + 1) failures.push('horizontal document overflow');
      return failures;
    }, selectors);
    assert(!failures.length, `${name}: ${failures.join('; ')}`);
    results.push(name);
  };
  const menu = async id => { await page.locator('#command-menu summary').click(); await page.locator(id).click(); };
  const selectMove = async move => {
    await page.evaluate(border => window.__PATROL__.map.revealPost(border), move.border);
    await page.waitForFunction(() => !window.__PATROL__.map.map.isMoving());
    await page.locator(`.border-post[data-border="${move.border}"]`).click();
    await page.locator(`[data-squad="${move.squad}"]`).click();
  };
  const finishMove = () => page.waitForFunction(() => !window.__PATROL__.game.activeOrder, null, { timeout: 15000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:3000/patrol/');
  await ready();
  assert(!await page.locator('#phone-gate').count(), 'phone blocker must be removed');
  assert(!await page.locator('#focus-runner, #toggle-posts, #post-drawer, #fit-country, #game-status').count(), 'removed tools must be absent');
  await checkGeometry('phone case file', ['.case-card', '#case-start']);
  await page.screenshot({ path: 'output/playwright/mobile-case.png' });
  await startCase();
  for (let move = 0; move < 2; move++) {
    await page.waitForFunction(() => !document.querySelector('.hunt-guide').hidden && document.querySelector('.hunt-guide').dataset.phase === 'post');
    await frame();
    await checkGeometry(`guide post ${move+1}`, ['.guide-card', '.guide-skip']);
    const target = await page.evaluate(() => window.__PATROL__.game.setup.witness[window.__PATROL__.game.ordersUsed]);
    await page.locator(`.border-post[data-border="${target.border}"]`).click();
    await checkGeometry(`guide squad ${move+1}`, ['.guide-card', '.guide-skip', '.squad-card']);
    await page.locator(`[data-squad="${target.squad}"]`).click();
    if (!move) {
      const id = await page.evaluate(() => window.__PATROL__.game.setup.id);
      await page.setViewportSize({ width: 844, height: 390 }); await frame();
      assert(await page.evaluate(() => window.__PATROL__.game.setup.id) === id, 'rotation changed hunt');
      await checkGeometry('landscape guide moving', ['.guide-card', '.guide-skip', '.squad-card', '#journey']);
      await page.waitForFunction(() => !window.__PATROL__.map.map.isMoving());
      await page.screenshot({ path: 'output/playwright/mobile-guide-landscape.png' });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await finishMove();
  }
  await page.waitForFunction(() => document.querySelector('#result').open);
  await checkGeometry('phone result', ['#result', '#result-primary', '#result-secondary']);
  assert(await page.evaluate(() => window.__PATROL__.game.outcome.kind) === 'won', 'guided hunt did not win');
  await page.screenshot({ path: 'output/playwright/mobile-result.png' });
  await page.locator('#make-headlines').click();
  await page.waitForFunction(() => !document.querySelector('#poster-share').disabled);
  await checkGeometry('phone newspaper chrome', ['.poster-dialog', '.poster-toolbar', '.poster-export', '#poster-share', '#poster-close']);
  await page.locator('#player-name').fill('Officer Mobile');
  await page.waitForFunction(() => !document.querySelector('#poster-download').disabled);
  assert(await page.locator('#newspaper').evaluate(canvas => canvas.width === 1200 && canvas.height === 1500), 'export dimensions changed');
  await page.screenshot({ path: 'output/playwright/mobile-newspaper.png' });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#poster-download').click();
  const download = await downloadPromise;
  assert(download.suggestedFilename().endsWith('-front-page.png'), 'download filename');
  await page.locator('#poster-close').click();
  await page.locator('#result-primary').click(); await startCase();
  await menu('#how-to');
  for (let i=0;i<5;i++) { await checkGeometry(`help slide ${i+1}`, ['.tutorial-card','#tutorial-next','#tutorial-skip']); await page.locator('#tutorial-next').click(); }
  assert(await page.locator('#command-menu summary').evaluate(el => el === document.activeElement), 'help focus not restored to visible menu');
  for (const [width,height] of [[320,568],[390,844],[768,1024],[844,390],[568,320],[1024,768],[1440,900]]) {
    await page.setViewportSize({width,height}); await frame();
    const phone = width <= 600 || (width <= 960 && height <= 540);
    const compact = width <= 900 || height <= 540;
    if (compact) assert(!await page.locator('.squad-dock').isVisible(), `idle squad picker should be closed ${width}x${height}`);
    const idleHintTop = await page.locator('#show-hint').evaluate(el=>el.getBoundingClientRect().top);
    assert(await page.locator('.hud-identity').isVisible() === !phone, `logo/country bar visibility ${width}x${height}`);
    assert(await page.getByRole('button',{name:'Zoom in',exact:true}).isVisible() === !phone, `zoom controls visibility ${width}x${height}`);
    if (phone) {
      const overlap = await page.evaluate(() => {
        const a=document.querySelector('#show-hint').getBoundingClientRect(),b=document.querySelector('.metrics').getBoundingClientRect();
        return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
      });
      assert(!overlap, `Hint overlaps centered moves counter ${width}x${height}`);
    }
    await checkGeometry(`game ${width}x${height}`, ['.topbar','#country','#command-menu summary','.map-toolbar','.squad-card']);
    const post = await page.evaluate(() => window.__PATROL__.game.setup.witness[0].border);
    await page.evaluate(border => window.__PATROL__.map.revealPost(border), post);
    await page.waitForFunction(() => !window.__PATROL__.map.map.isMoving());
    await page.locator(`.border-post[data-border="${post}"]`).click();
    if (compact) {
      assert(await page.locator('.squad-dock').isVisible(), `selected post should open squads ${width}x${height}`);
      await page.waitForFunction(() => document.querySelector('#show-hint').getBoundingClientRect().bottom <= document.querySelector('.squad-dock').getBoundingClientRect().top - 4);
      assert(await page.locator('#show-hint').evaluate(el=>el.getBoundingClientRect().top) < idleHintTop, 'Hint did not rise above the picker');
    }
    await checkGeometry(`post selection ${width}x${height}`, ['#selection-detail','#clear-selection','.squad-card']);
    await page.locator('#clear-selection').click();
    if (compact) {
      assert(!await page.locator('.squad-dock').isVisible(), 'Clear should close mobile picker');
      assert(await page.locator('#command-menu summary').evaluate(el=>el===document.activeElement), 'Clear left focus in hidden picker');
      await page.waitForFunction(top => Math.abs(document.querySelector('#show-hint').getBoundingClientRect().top-top)<2, idleHintTop);
    }
    await menu('#case-file');
    await checkGeometry(`case ${width}x${height}`, ['.case-card','#case-start']); await startCase();
  }
  // Four-squad short-landscape interaction and in-flight refresh recovery.
  await page.setViewportSize({width:1024,height:768});
  await page.locator('#country').selectOption('usa'); await ready(); await startCase();
  await page.setViewportSize({width:568,height:320});
  const move = await page.evaluate(() => window.__PATROL__.game.setup.witness[0]);
  await page.evaluate(border => window.__PATROL__.map.revealPost(border), move.border);
  await page.waitForFunction(() => !window.__PATROL__.map.map.isMoving());
  await page.locator(`.border-post[data-border="${move.border}"]`).click();
  await checkGeometry('four squads selected short landscape', ['.squad-card','#selection-detail','#clear-selection']);
  await page.locator('#clear-selection').click();
  assert(await page.evaluate(() => window.__PATROL__.selectedPost === null), 'clear did not clear destination');
  await selectMove(move);
  await checkGeometry('four squads moving short landscape', ['.squad-card','#journey']);
  await page.reload(); await ready(); await finishMove();
  assert(await page.evaluate(() => window.__PATROL__.game.ordersUsed) === 1, 'in-flight refresh lost move');
  const orders = await page.evaluate(() => window.__PATROL__.game.ordersUsed);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#show-hint').click();
  await page.waitForFunction(() => !document.querySelector('#hint-panel').getAttribute('aria-busy') || document.querySelector('#hint-panel').getAttribute('aria-busy') === 'false', null, {timeout:15000});
  assert(await page.evaluate(() => window.__PATROL__.game.ordersUsed) === orders, 'hint spent a move');
  await checkGeometry('phone hint', ['#hint-panel','#close-hint','.squad-card']);
  await page.waitForFunction(() => !window.__PATROL__.map.map.isMoving());
  assert(await page.locator('#close-hint').evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }), 'hint close covered by map markers');
  await page.screenshot({path:'output/playwright/mobile-hint.png'});
  await page.locator('#close-hint').click();
  await page.locator('#clear-selection').click();
  await page.waitForFunction(() => !window.__PATROL__.map.map.isMoving());
  await page.waitForFunction(() => document.querySelector('#show-hint').getBoundingClientRect().bottom >= innerHeight - 30);
  await page.screenshot({path:'output/playwright/mobile-gameplay.png'});
  const cdp=await context.newCDPSession(page);
  const zoom=await page.evaluate(()=>window.__PATROL__.map.map.getZoom());
  await cdp.send('Input.synthesizePinchGesture',{x:195,y:350,scaleFactor:1.5,gestureSourceType:'touch'});
  await page.waitForFunction(before=>window.__PATROL__.map.map.getZoom()>before+.1,zoom);
  results.push('touch pinch zoom without zoom buttons');
  await page.evaluate(()=>window.__PATROL__.loadLevel('hungary','browser_check'));
  await ready(); await startCase();
  const hungary=await page.evaluate(()=>window.__PATROL__.game.setup.witness);
  for(const order of hungary) {await selectMove(order);await finishMove();}
  await page.waitForFunction(()=>document.querySelector('#result').open);
  assert(await page.evaluate(()=>window.__PATROL__.game.outcome.kind)==='won','Hungary capture failed');
  await checkGeometry('Hungary direct-map capture', ['#result','#result-primary']);
  assert(!errors.length, `page errors: ${errors.join('; ')}`);
  return { checks: results.length, passed: results, pageErrors: errors, nativeShare: 'requires device validation' };
  } catch (error) { await page.screenshot({path:'output/playwright/mobile-failure.png'}); throw error; }
  finally { await context.close(); }
}
