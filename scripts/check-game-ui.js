// Playwright CLI run-code --filename scripts/check-game-ui.js
// Uses the open browser origin; local preview uses its development-only save mode.
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
    errors = [];
  const origin =
    new URL(basePage.url()).origin +
    (new URL(basePage.url()).hostname === "localhost" ? "/?local=1" : "/");
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/https:\/\/[^/]*(?:posthog|facebook)[^/]*\//, (r) =>
    r.abort(),
  );
  const coach = () => page.locator(".coach");
  const layout = async (label) =>
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      label + " fits horizontally",
    );
  const move = async (order, guided = false) => {
    await page
      .locator(`[data-action="select-squad"][data-squad="${order.squad}"]`)
      .click();
    if (guided)
      check(
        (await coach().innerText()).includes("Close Post"),
        "Guide explains post selection",
      );
    else await page.locator('[data-action="country-view"]').click();
    await page.locator(`[data-border="${order.border}"]`).click();
    check(
      await page.locator('[data-action="deploy"]').isVisible(),
      "Move requires an explicit Deploy",
    );
    check(
      (await page.locator("#journey").innerText()).includes("Fugitive travels"),
      "Pursuit distance is advertised before commitment",
    );
    if (guided)
      check(
        (await coach().innerText()).includes("Read the chase"),
        "Guide explains both preview paths",
      );
    await page.locator('[data-action="deploy"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector("#result-panel:not([hidden])") ||
        document
          .querySelector("#journey")
          ?.textContent?.includes("Time paused"),
    );
  };
  try {
    await page.goto(origin);
    await page.locator('[data-action="choose"][data-level="1"]').waitFor();
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
      await layout(`Base ${width}`);
      await page.locator('.bottom-nav [data-action="levels"]').click();
      check(
        (await page.locator(".level-card").count()) === 15,
        "15 distinct cases at " + width,
      );
      check(
        (await page.locator(".level-card.locked").count()) === 14,
        "Locked cases remain inspectable at " + width,
      );
      await layout("Cases " + width);
      await page.locator('.level-card[data-level="15"]').click();
      check(
        (await page.locator("dialog").innerText()).includes("116"),
        "Locked preview shows level-specific speed",
      );
      check(
        (await page.locator('dialog [data-action="choose"]').count()) === 0,
        "Preview does not unlock a locked level",
      );
      await page.locator('[data-action="close-modal"]').click();
      await page.locator('.bottom-nav [data-action="academy"]').click();
      await layout("Academy " + width);
      await page.locator('.bottom-nav [data-action="home"]').click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "output/playwright/game-ui-home.png" });
    await page.locator('[data-action="choose"][data-level="1"]').click();
    check(await coach().isVisible(), "Tutorial starts immediately after Play");
    check(
      (await page.locator(".deployment-slot.filled").count()) === 0,
      "First lesson requires actually selecting the roster",
    );
    check(
      await page.locator(".case-profile img").isVisible(),
      "Fugitive portrait is present at squad selection",
    );
    check(
      (await page.locator(".speed-badge").innerText()).includes("48"),
      "Briefing displays actual level speed",
    );
    for (const id of ["patrol-1", "patrol-2", "patrol-3"]) {
      check(
        (await coach().innerText()).includes("Select Patrol"),
        "Roster selection is coached",
      );
      await page.locator(`[data-action="add-squad"][data-id="${id}"]`).click();
    }
    check(
      (await coach().innerText()).includes("Your squad is ready"),
      "Guide moves to Start after selecting squads",
    );
    await page.locator('[data-action="start"]').click();
    await page.locator(".border-post").first().waitFor();
    check(
      (await page.locator(".runner-marker img").count()) === 1,
      "Veerappan portrait is restored on the map",
    );
    await move(levels[0].witness[0], true);
    await page.reload();
    await page.locator(".border-post").first().waitFor();
    check(
      (await coach().innerText()).includes("MOVE 2"),
      "Guide resumes the actual move after refresh",
    );
    const next = levels[0].witness[1];
    await page
      .locator(`[data-action="select-squad"][data-squad="${next.squad}"]`)
      .click();
    await page.locator(`[data-border="${next.border}"]`).click();
    await page.screenshot({ path: "output/playwright/game-ui-preview.png" });
    await page.locator('[data-action="deploy"]').click();
    await page.locator('[data-action="next"]').waitFor();
    check(
      (await coach().count()) === 0,
      "Full field tutorial ends after the first win",
    );
    await page.screenshot({ path: "output/playwright/game-ui-win.png" });
    await page.locator('[data-action="next"]').click();
    check((await coach().count()) === 0, "Level 2 has no tutorial");
    await page.locator('[data-action="start"]').click();
    await page.locator(".border-post").first().waitFor();
    for (const order of levels[1].witness) await move(order);
    await page.locator('[data-action="next"]').waitFor();
    check(
      (await coach().innerText()).includes("faster squad"),
      "Level 3 unlock returns the coach",
    );
    await page.locator('#result-panel [data-action="academy"]').click();
    check(
      (await coach().innerText()).includes("Recruit Rapid"),
      "Academy recruit is highlighted",
    );
    await page.locator('[data-action="purchase"][data-id="rapid"]').click();
    await page.locator("dialog[open]").waitFor();
    check(
      (await page.locator("dialog").innerText()).includes("Google"),
      "Optional login appears after the first purchase",
    );
    await page.locator('dialog [data-action="close-modal"]').last().click();
    check(
      (await coach().innerText()).includes("first upgrade"),
      "Coach resumes with training after login is dismissed",
    );
    await page.locator('[data-action="train"][data-id="rapid"]').click();
    check(
      (await coach().innerText()).includes("Training is underway"),
      "Training timer and unavailability are explained",
    );
    await page.screenshot({ path: "output/playwright/game-ui-training.png" });
    await page.locator('[data-action="lesson-done"]').click();
    await coach().waitFor({ state: "detached" });
    await page.reload();
    await page.locator('[data-unit="rapid"]').waitFor();
    check(
      (await coach().count()) === 0,
      "Completed Academy lesson stays dismissed after refresh",
    );
    await page.locator('[data-action="choose"][data-level="3"]').click();
    check(
      await page
        .locator('[data-action="add-squad"][data-id="rapid"]')
        .isDisabled(),
      "Training squad cannot be selected",
    );
    await page.locator('[data-action="remove-slot"][data-slot="1"]').click();
    await page.locator('[data-action="start"]').click();
    await page.locator(".border-post").first().waitFor();
    check(
      (await page.locator(".game-squad").count()) === 2,
      "Level can start with an empty slot during training",
    );
    check(
      (await coach().count()) === 0,
      "No further gameplay tutorial at Level 3",
    );
    await page.locator('[data-action="leave"]').click();
    await page.locator('[data-action="abandon"]').click();
    await page.locator('.bottom-nav [data-action="academy"]').click();
    await page
      .locator('[data-action="train"][data-id="rapid"]')
      .waitFor({ timeout: 40000 });
    check(
      (
        await page.locator('[data-unit="rapid"] .stat-line').innerText()
      ).includes("240"),
      "First upgrade applies only when the timer finishes",
    );
    check(
      (await coach().count()) === 0,
      "Training completion does not restart tutorials",
    );
    check(errors.length === 0, "No uncaught browser errors");
    return { checks: checks.length, passed: checks, errors };
  } catch (error) {
    await page.screenshot({
      path: "output/playwright/game-ui-failure.png",
      fullPage: true,
    });
    throw new Error(
      String(error) +
        "\n" +
        (await page.locator("body").innerText()).slice(-2400),
    );
  } finally {
    await context.close();
  }
}
