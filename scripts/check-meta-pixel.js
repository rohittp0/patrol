// Run with Playwright CLI run-code --filename against npm run dev.
// Meta uploads are intercepted; no synthetic conversions are sent to Meta.
async (basePage) => {
  const browser = basePage.context().browser();
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const results = [], performanceSamples = [];
  const contexts = [];
  const make = async (mode) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Kolkata',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    });
    contexts.push(context);
    const events = [], errors = [], requests = [];
    // Keep PostHog network behavior identical in both performance samples.
    await context.route('**/*posthog.com/**', route => route.abort());
    await context.route('https://www.facebook.com/**', route => {
      const request = route.request(), url = new URL(request.url());
      const params = request.postData() ? new URLSearchParams(request.postData()) : url.searchParams;
      if (params.has('ev')) events.push(Object.fromEntries(params));
      return route.fulfill({ status: 200, body: '' });
    });
    if (mode === 'baseline') await context.route('**/src/telemetry/index.ts', async route => {
      const response = await route.fetch();
      const original = await response.text();
      assert(original.includes('initMetaPixel(window, document)'), 'baseline substitution must match');
      await route.fulfill({ response, body: original.replace('initMetaPixel(window, document)', '(() => {})') });
    });
    if (mode === 'blocked') await context.route('https://connect.facebook.net/**', route => route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/facebook\.(net|com)/.test(request.url())) requests.push(request.url()); });
    const ready = () => page.waitForFunction(() => window.__PATROL__?.game && document.querySelector('#loading').hidden);
    const count = name => events.filter(event => event.ev === name).length;
    return { context, page, ready, events, errors, requests, count };
  };
  const sample = async (session, label) => {
    const { page } = session;
    const cdp = await session.context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
    const before = await metrics();
    const frame = await page.evaluate(() => new Promise(resolve => {
      const times = []; const start = performance.now();
      const next = time => { times.push(time); if (time - start < 800) requestAnimationFrame(next); else {
        const deltas = times.slice(1).map((value, index) => value - times[index]).sort((a, b) => a - b);
        resolve({ fps: Math.round((times.length - 1) * 1000 / (times.at(-1) - times[0])), p95_frame_ms: Math.round(deltas[Math.floor(deltas.length * .95)] * 10) / 10 });
      } }; requestAnimationFrame(next);
    }));
    const after = await metrics();
    const load = await page.evaluate(() => ({
      country_prepare_ms: window.__PATROL_TELEMETRY__.recent.find(event => event.name === 'country_load_success').params.duration_ms,
      dom_content_loaded_ms: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd),
    }));
    performanceSamples.push({ label, ...load, ...frame, main_thread_task_ms: Math.round((after.TaskDuration - before.TaskDuration) * 1000), heap_mb: Math.round(after.JSHeapUsedSize / 1048576) });
    await cdp.detach();
  };
  try {
    const local = await make('local');
    await local.page.goto('http://localhost:3000/patrol/'); await local.ready();
    assert(!await local.page.evaluate(() => window.fbq), 'ordinary development must not install Meta');
    assert(local.requests.length === 0, 'ordinary development must send no Meta requests');
    results.push('ordinary development disabled');

    for (const mode of ['baseline', 'enabled']) {
      const session = await make(mode);
      await session.page.goto('http://localhost:3000/patrol/?telemetry_debug=1'); await session.ready();
      if (mode === 'enabled') await session.page.waitForFunction(() => !!window.fbq?.callMethod);
      await session.page.locator('#case-start').click();
      await sample(session, `${mode}: cold`);
      await session.page.reload(); await session.ready();
      if (await session.page.locator('#case-start').isVisible()) await session.page.locator('#case-start').click();
      await sample(session, `${mode}: warm`);
      if (mode === 'baseline') continue;
      const { page, count, events } = session;
      await page.waitForFunction(() => !!window.fbq?.callMethod);
      assert(count('PageView') === 2 && count('GameStart') === 1 && count('GameResume') === 1, 'load and resume counts');
      for (let i = 0; i < 2; i++) {
        await page.waitForFunction(() => !document.querySelector('.hunt-guide').hidden && document.querySelector('.hunt-guide').dataset.phase === 'post');
        const move = await page.evaluate(() => window.__PATROL__.game.setup.witness[window.__PATROL__.game.ordersUsed]);
        await page.locator(`.border-post[data-border="${move.border}"]`).click();
        await page.locator(`[data-squad="${move.squad}"]`).click();
        if (!i) await sample(session, 'enabled: squad moving');
        await page.waitForFunction(() => !window.__PATROL__.game.activeOrder, null, { timeout: 15000 });
      }
      await page.waitForFunction(() => document.querySelector('#result').open);
      await page.waitForTimeout(500);
      assert(count('GameCompleted') === 1 && count('GameWon') === 1 && count('TutorialCompleted') === 1, 'guided capture events');
      const completed = events.find(event => event.ev === 'GameCompleted');
      assert(completed.id === '1412945137121409' && completed['cd[success]'] === '1' && completed['cd[moves_used]'] === '2', 'capture parameters');
      await page.evaluate(() => { window.__PATROL__.render(); window.__PATROL__.render(); });
      assert(count('GameCompleted') === 1, 'repeat result render must not duplicate outcome');
      await page.locator('#make-headlines').click();
      await page.waitForFunction(() => !document.querySelector('#poster-download').disabled);
      await page.locator('#player-name').fill('META_PRIVATE_NAME');
      await page.locator('#poster-download').click();
      await page.waitForTimeout(300);
      assert(count('NewspaperDownloaded') === 1, 'download event');
      await page.evaluate(() => { navigator.share = async () => {}; navigator.canShare = () => true; });
      await page.locator('#poster-share').click();
      await page.waitForTimeout(300);
      assert(count('NewspaperShared') === 1, 'successful native share event');
      assert(!JSON.stringify(events).includes('META_PRIVATE_NAME'), 'Meta must not receive the saved player name');
      assert(events.every(event => !Object.keys(event).some(key => /cd\[(name|photo|attempt_id|profile_id)\]/.test(key))), 'Meta gameplay identity exclusion');
      await page.reload(); await session.ready();
      await page.waitForFunction(() => !!window.fbq?.callMethod);
      await page.waitForTimeout(300);
      assert(count('GameCompleted') === 1 && count('GameWon') === 1 && count('PageView') === 3, 'completed-save refresh must not repeat conversion');
      assert(session.errors.length === 0, JSON.stringify(session.errors));
      results.push('real Meta SDK payloads with PostHog network blocked', 'guided two-move capture', 'resume and completed-save deduplication', 'download and successful native share', 'profile excluded');
    }
    const blocked = await make('blocked');
    await blocked.page.goto('http://localhost:3000/patrol/?telemetry_debug=1'); await blocked.ready();
    await blocked.page.locator('#case-start').click();
    assert(await blocked.page.evaluate(() => window.fbq.queue.some(args => args[2] === 'GameStart')), 'blocked SDK retains early gameplay');
    assert(blocked.errors.length === 0, 'blocked pixel must not throw');
    results.push('blocked Meta SDK leaves game playable');
    return { results, performanceSamples, limits: 'Chromium desktop with phone viewport; intercepted uploads prove payloads, not Meta ingestion. Physical-device performance and sharing unverified.' };
  } finally {
    for (const context of contexts) await context.close();
  }
}
