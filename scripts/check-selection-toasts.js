async (basePage) => {
  const origin = new URL(basePage.url()).origin,
    context = await basePage
      .context()
      .browser()
      .newContext({ viewport: { width: 390, height: 844 } }),
    page = await context.newPage(),
    checks = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  try {
    await page.goto(
      origin + (origin.includes("localhost") ? "/?local=1" : "/"),
    );
    await page.locator('[data-action="choose"][data-level="1"]').click();
    const levels = await page.evaluate(
      async () =>
        (await (await fetch("/data/india-campaign.json")).json()).levels,
    );
    for (const id of ["patrol-1", "patrol-2", "patrol-3"])
      await page.locator(`[data-action="add-squad"][data-id="${id}"]`).click();
    await page.locator('[data-action="start"]').click();
    await page
      .locator('#map[data-basemap="ready"]')
      .waitFor({ timeout: 30000 });
    const first = levels[0].witness[0];
    check(
      (await page
        .locator(`.border-post.guided[data-border="${first.border}"]`)
        .count()) === 1,
      "The taught destination is visible for either selection order",
    );
    await page.locator(`[data-border="${first.border}"]`).click();
    check(
      (await page
        .locator(`[data-border="${first.border}"]`)
        .getAttribute("aria-pressed")) === "true",
      "Post can be selected before a squad during the mandatory guide",
    );
    check(
      (await page.locator('[data-action="deploy"]').count()) === 0,
      "Post alone cannot spend a move",
    );
    await page
      .locator(`[data-action="select-squad"][data-squad="${first.squad}"]`)
      .click();
    check(
      await page.locator('[data-action="deploy"]').isVisible(),
      "Selecting squad second produces the preview",
    );
    check(
      (await page.locator("#moves-left").innerText()) === "15",
      "Selection does not spend a move",
    );
    await page.locator('[data-action="deploy"]').click();
    await page.waitForFunction(() =>
      document.querySelector("#journey")?.textContent?.includes("Time paused"),
    );
    const last = levels[0].witness[1];
    check(
      (await page
        .locator(`.border-post.guided[data-border="${first.border}"]`)
        .count()) === 0,
      "Old guided posts stop glowing after their move",
    );
    await page
      .locator(`[data-action="select-squad"][data-squad="${last.squad}"]`)
      .click();
    await page.locator(`[data-border="${last.border}"]`).click();
    await page.locator('[data-action="deploy"]').click();
    await page.locator('#result-panel [data-action="home"]').click();
    await page.locator('.bottom-nav [data-action="levels"]').click();
    await page.locator('.level-card[data-level="1"]').click();
    await page.locator('dialog [data-action="choose"]').click();
    await page.locator('[data-action="start"]').click();
    await page
      .locator('#map[data-basemap="ready"]')
      .waitFor({ timeout: 30000 });
    await page.locator(`[data-border="${first.border}"]`).click();
    await page.locator('[data-action="select-squad"][data-squad="0"]').click();
    await page
      .locator(`[data-action="select-squad"][data-squad="${first.squad}"]`)
      .click();
    check(
      (await page
        .locator(`[data-border="${first.border}"]`)
        .getAttribute("aria-pressed")) === "true",
      "Changing squads retains the chosen destination",
    );
    check(
      await page.locator('[data-action="deploy"]').isVisible(),
      "Changing squads recalculates the preview",
    );
    await page.locator('[data-action="clear"]').click();
    if (!origin.includes("localhost"))
      await page.waitForFunction(
        () =>
          JSON.parse(localStorage.getItem("patrol:outbox:v1") || "null")
            ?.pending.length === 0,
      );
    await page.clock.install();
    await page.locator(`[data-border="${levels[0].posts[0]}"]`).click();
    await page.locator(".toast.visible").waitFor();
    await page.clock.fastForward(19999);
    check(
      (await page.locator(".toast.visible").count()) === 1,
      "Toast remains visible before its 20-second deadline",
    );
    await page.clock.fastForward(2);
    check(
      (await page.locator(".toast.visible").count()) === 0,
      "Toast automatically dismisses after 20 seconds",
    );
    await page.locator(`[data-border="${levels[0].posts[0]}"]`).click();
    await page.clock.fastForward(10000);
    await page.locator(`[data-border="${levels[0].posts[1]}"]`).click();
    await page.clock.fastForward(10001);
    check(
      (await page.locator(".toast.visible").count()) === 1,
      "A new toast gets a fresh 20-second deadline",
    );
    await page.locator('[data-action="dismiss"]').click();
    check(
      (await page.locator(".toast.visible").count()) === 0,
      "Manual dismissal still works",
    );
    for (const order of levels[0].witness) {
      await page
        .locator(`[data-action="select-squad"][data-squad="${order.squad}"]`)
        .click();
      await page.locator(`[data-border="${order.border}"]`).click();
      await page.locator('[data-action="deploy"]').click();
      await page.waitForFunction(
        () =>
          document.querySelector(".capture-moment") ||
          document
            .querySelector("#journey")
            ?.textContent?.includes("Time paused"),
      );
    }
    await page.locator(".reward-earned").waitFor();
    check(
      (await page.locator(".reward-earned").innerText()).includes("+ 0"),
      "Replay calculation does not pay the same reward twice",
    );
    return { checks: checks.length, passed: checks };
  } catch (error) {
    await page.screenshot({
      path: "output/playwright/patrol-selection-failure.png",
    });
    throw new Error(
      String(error) +
        "\n" +
        (await page.locator("body").innerText()).slice(-1600),
    );
  } finally {
    await context.close();
  }
}
