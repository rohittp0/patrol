// Matched desktop phone emulation; uploads intercepted, real SDKs/config.
async (basePage) => {
  const sample = async enabled => {
  const context = await basePage
    .context()
    .browser()
    .newContext({
      viewport: { width: 390, height: 844 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      isMobile: true,
      hasTouch: true,
    });
  const page = await context.newPage(),
    cdp = await context.newCDPSession(page);
  const origin =
    new URL(basePage.url()).origin +
    (new URL(basePage.url()).hostname === "localhost" ? (enabled ? "/?local=1&telemetry_debug=1" : "/?local=1") : (enabled ? "/?telemetry_debug=1" : "/"));
  const metric = (values, name) => values.find((m) => m.name === name)?.value;
  await context.route("**/*posthog.com/**", route => {
    const r=route.request();
    return r.method()==="POST"
      ? route.fulfill({status:200,contentType:"application/json",body:'{"status":1}'}) : route.continue();
  });
  await context.route("https://www.facebook.com/**", route=>route.fulfill({status:200,body:""}));
  try {
    await cdp.send("Performance.enable");
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.goto(origin,{waitUntil:"domcontentloaded"});
    await page.locator('[data-action="choose"][data-level="1"]').waitFor();
    const coldReadyMs = await page.evaluate(
      () => performance.getEntriesByName("patrol-ready")[0].startTime,
    );
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator('[data-action="choose"][data-level="1"]').waitFor();
    const warmReadyMs = await page.evaluate(
      () => performance.getEntriesByName("patrol-ready")[0].startTime,
    );
    const levels = await page.evaluate(
      async () =>
        (await (await fetch("/data/india-campaign.json")).json()).levels,
    );
    await page.locator('[data-action="choose"][data-level="1"]').click();
    for (const id of ["patrol-1", "patrol-2", "patrol-3"])
      await page.locator(`[data-action="add-squad"][data-id="${id}"]`).click();
    await page.locator('[data-action="start"]').click();
    await page.locator(".border-post").first().waitFor();
    if(enabled) {
      await page.waitForFunction(()=>window.__PATROL_TELEMETRY__?.ready && window.fbq?.callMethod,null,{timeout:60000});
      await page.waitForTimeout(3000);
    }
    const move = levels[0].witness[0];
    await page
      .locator(`[data-action="select-squad"][data-squad="${move.squad}"]`)
      .click();
    const started = Date.now();
    await page.locator(`[data-border="${move.border}"]`).click();
    const previewInteractionMs = Date.now() - started;
    await page.evaluate(() => {
      window.__frames = [];
      window.__sampling = true;
      let last = 0;
      const f = (t) => {
        if (!window.__sampling) return;
        if (last) window.__frames.push(t - last);
        last = t;
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    const before = (await cdp.send("Performance.getMetrics")).metrics,
      start = Date.now();
    await page.locator('[data-action="deploy"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector("#moves-left")?.textContent === "14" &&
        document
          .querySelector("#journey")
          ?.textContent?.includes("Time paused"),
    );
    const moveWallMs = Date.now() - start,
      after = (await cdp.send("Performance.getMetrics")).metrics;
    const frames = await page.evaluate(() => {
      window.__sampling = false;
      return window.__frames.sort((a, b) => a - b);
    });
    const median = frames[Math.floor(frames.length * 0.5)],
      p95 = frames[Math.floor(frames.length * 0.95)];
    return {
      providersEnabled: enabled,
      environment: origin.includes("localhost")
        ? "desktop Chromium touch emulation, Vite development, local save"
        : "desktop Chromium touch emulation, production build, anonymous Firebase save",
      coldReadyMs,
      warmReadyMs,
      previewInteractionMs,
      moveWallMs,
      frameCount: frames.length,
      medianFrameMs: median,
      p95FrameMs: p95,
      medianFps: 1000 / median,
      taskCpuMs:
        1000 * (metric(after, "TaskDuration") - metric(before, "TaskDuration")),
      heapMiB: metric(after, "JSHeapUsedSize") / 1048576,
    };
  } finally {
    await cdp.detach();
    await context.close();
  }

  };
  return {disabled:await sample(false), enabled:await sample(true)};
}
