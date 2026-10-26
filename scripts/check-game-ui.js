// Real UI + Firebase: hold the network while the entire first-purchase flow plays.
async (basePage) => {
  const context = await basePage
    .context()
    .browser()
    .newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const page = await context.newPage(),
    checks = [],
    errors = [],
    timing = {};
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const journal = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("patrol:outbox:v1") || "null"),
    );
  const coach = () => page.locator(".coach");
  const origin = new URL(basePage.url()).origin;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/https:\/\/[^/]*(?:posthog|facebook)[^/]*\//, (r) =>
    r.abort(),
  );
  const move = async (order, guided = false) => {
    await page
      .locator(`[data-action="select-squad"][data-squad="${order.squad}"]`)
      .click();
    const post = page.locator(`[data-border="${order.border}"]`);
    // In unguided play the map can be panned/zoomed with normal gestures.
    if (!guided) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const b = await post.boundingBox();
        const dock = await page.locator(".squad-dock").boundingBox();
        if (
          b &&
          b.x > 0 &&
          b.x + b.width < 390 &&
          b.y > 85 &&
          b.y + b.height < dock.y
        )
          break;
        await page.mouse.move(150, 350);
        await page.mouse.wheel(0, 250);
      }
    }
    await post.click();
    check(
      (await page.locator("#journey").innerText()).includes("Fugitive travels"),
      "Movement is previewed before Deploy",
    );
    await page.locator('[data-action="deploy"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector(".capture-moment") ||
        document
          .querySelector("#journey")
          ?.textContent?.includes("Time paused"),
    );
  };
  try {
    await page.goto(origin + "/");
    await page.locator('[data-action="choose"][data-level="1"]').waitFor();
    await page.bringToFront();
    const levels = await page.evaluate(
      async () =>
        (await (await fetch("/data/india-campaign.json")).json()).levels,
    );
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [844, 390],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `Base ${width} fits`,
      );
      await page.locator('.bottom-nav [data-action="levels"]').click();
      check(
        (await page.locator(".level-card").count()) === 15,
        `15 cases at ${width}`,
      );
      await page.locator('.level-card[data-level="15"]').click();
      check(
        (await page.locator("dialog").innerText()).includes("116"),
        "Locked preview has correct speed",
      );
      check(
        (await page.locator('dialog [data-action="choose"]').count()) === 0,
        "Preview cannot unlock levels",
      );
      await page.locator('dialog [data-action="close-modal"]').click();
      await page.locator('.bottom-nav [data-action="home"]').click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-action="choose"][data-level="1"]').click();
    check(await coach().isVisible(), "Guide starts on Play");
    check(
      (await page.locator('[data-action="skip-guide"]').count()) === 0,
      "Tutorial has no Skip control",
    );
    await page.locator('.bottom-nav [data-action="home"]').click();
    check(
      page.url().endsWith("#roster"),
      "Guide cannot be bypassed through navigation",
    );
    for (const id of ["patrol-1", "patrol-2", "patrol-3"])
      await page.locator(`[data-action="add-squad"][data-id="${id}"]`).click();
    await context.route(
      /https?:\/\/(?:firestore\.googleapis\.com|(?:127\.0\.0\.1|localhost):8080)\//,
      async (route) => {
        await gate;
        await route.continue().catch(() => {});
      },
    );
    let started = Date.now();
    await page.locator('[data-action="start"]').click();
    await page.locator(".game-page").waitFor({ timeout: 1200 });
    timing.startWithCloudHeldMs = Date.now() - started;
    check(true, "Game starts before Firebase acknowledges it");
    await page
      .locator('#map[data-basemap="ready"]')
      .waitFor({ timeout: 30000 });
    check(true, "Real map tiles render");
    check(
      (await page
        .locator(
          '[data-action="hint"],[data-action="find"],[data-action="country-view"],[data-action="help"]',
        )
        .count()) === 0,
      "Hint, focus and information controls are removed",
    );
    await page.locator('[data-action="leave"]').click();
    check(page.url().endsWith("#play"), "Field training cannot be exited");
    await page.keyboard.press("Escape");
    check(await coach().isVisible(), "Escape cannot dismiss the tutorial");
    await page.screenshot({ path: "output/playwright/patrol-next-map.png" });
    for (const order of levels[0].witness) await move(order, true);
    await page.locator("#result-panel.victory:not([hidden])").waitFor();
    check(
      (await page.locator(".reward-equation").innerText()).includes("90"),
      "Reward shows base × multiplier = 90",
    );
    check(
      (await page.locator(".balance-equation").innerText()).includes(
        "0 + 90 = 90",
      ),
      "Reward shows balance addition",
    );
    check(
      (await page.locator('#result-panel [data-action="academy"]').count()) ===
        0,
      "Winning screen has no Academy option",
    );
    check(
      (await page
        .locator('#result-panel .secondary[data-action="home"] svg')
        .count()) === 1,
      "Home is a secondary button with a home icon",
    );
    check(
      (await page.locator(".capture-celebration").count()) === 1,
      "Capture creates a celebration",
    );
    await page.waitForFunction(() => {
      const r = document
          .querySelector(".runner-marker.captured")
          ?.getBoundingClientRect(),
        p = document.querySelector("#result-panel")?.getBoundingClientRect();
      return r && p && r.top > 85 && r.bottom < p.top;
    });
    check(true, "Camera keeps the actual capture above the reward card");
    check(
      (await journal()).pending.length > 0,
      "Win and reward do not wait for cloud writes",
    );
    await page.screenshot({ path: "output/playwright/patrol-next-win.png" });
    await page.locator('#result-panel [data-action="next"]').click();
    check((await coach().count()) === 0, "Level 2 is unguided");
    await page.locator('[data-action="start"]').click();
    await page.locator(".game-squad").first().waitFor();
    for (const order of levels[1].witness) await move(order);
    await page.locator('#result-panel [data-action="next"]').waitFor();
    await page.locator('#result-panel [data-action="next"]').click();
    check(
      (await coach().innerText()).includes("Rapid Action unlocked"),
      "Level 3 resumes the mandatory guide",
    );
    await page.locator('.coach-target[data-action="academy"]').click();
    started = Date.now();
    await page.locator('[data-action="purchase"][data-id="rapid"]').click();
    await page.locator("dialog[open]").waitFor({ timeout: 1200 });
    timing.purchaseWithCloudHeldMs = Date.now() - started;
    check(true, "Recruitment and its login prompt do not wait for Firebase");
    await page.locator('dialog [data-action="close-modal"]').last().click();
    started = Date.now();
    await page.locator('[data-action="train"][data-id="rapid"]').click();
    await page.locator('[data-training="rapid"]').waitFor({ timeout: 1200 });
    timing.trainingWithCloudHeldMs = Date.now() - started;
    const before = await journal();
    const deadline =
      before.pending.at(-1).progress.player.squads.rapid.training.readyAt;
    check(
      before.pending.at(-1).progress.player.wallet === 180,
      "Purchase and training deduct coins immediately",
    );
    check(
      (await coach().innerText()).includes("Training is underway"),
      "Mandatory training explains the timer",
    );
    await page.screenshot({
      path: "output/playwright/patrol-next-training.png",
    });
    await page.locator('[data-action="lesson-done"]').click();
    await coach().waitFor({ state: "detached" });
    await page.reload();
    await page.locator('[data-training="rapid"]').waitFor({ timeout: 2500 });
    check(
      (await journal()).pending.at(-1).progress.player.wallet === 180,
      "Pending campaign survives refresh while cloud is still held",
    );
    check(
      (await coach().count()) === 0,
      "Completed tutorial stays completed after refresh",
    );
    release();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("patrol:outbox:v1") || "null")?.pending
          .length === 0,
      { timeout: 30000 },
    );
    const saved = await journal();
    check(
      saved.confirmed.player.wallet === 180,
      "Background queue persists the exact final balance",
    );
    check(
      saved.confirmed.player.squads.rapid.training.readyAt === deadline,
      "Cloud delay never restarts the training clock",
    );
    await page.reload();
    await page.locator('[data-unit="rapid"]').waitFor();
    check(
      (await journal()).confirmed.player.wallet === 180,
      "A fresh cloud read has no duplicated coins or purchases",
    );
    await page.locator('[data-action="choose"][data-level="3"]').click();
    check(
      await page
        .locator('[data-action="add-squad"][data-id="rapid"]')
        .isDisabled(),
      "Training squads remain unavailable",
    );
    await page.locator('[data-action="remove-slot"][data-slot="1"]').click();
    await page.locator('[data-action="start"]').click();
    await page.locator(".game-squad").first().waitFor();
    check(
      (await page.locator(".game-squad").count()) === 2,
      "Empty slots remain playable",
    );
    check(
      (await coach().count()) === 0,
      "No more guided gameplay after Level 1",
    );
    check(errors.length === 0, "No uncaught browser errors");
    return { checks: checks.length, timing, passed: checks, errors };
  } catch (error) {
    await page.screenshot({
      path: "output/playwright/patrol-next-failure.png",
      fullPage: true,
    });
    throw new Error(
      String(error) +
        "\n" +
        (await page.locator("body").innerText()).slice(-1800),
    );
  } finally {
    release();
    await context.close();
  }
}
