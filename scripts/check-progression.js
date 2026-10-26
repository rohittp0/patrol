// Run with the Playwright CLI against VITE_FIREBASE_EMULATORS=1 npm run dev.
async (basePage) => {
  const context = await basePage
    .context()
    .browser()
    .newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const checks = [];
  const assert = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const geometry = async (label) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert(!overflow, label + " has no horizontal overflow");
  };
  const waitHome = () =>
    page.getByRole("button", { name: /Play Level 1/ }).waitFor();
  const move = async (squad, border) => {
    await page.locator(`[data-border="${border}"]`).click();
    await page.locator(`[data-action="move"][data-squad="${squad}"]`).click();
    await page.waitForFunction(
      () =>
        !document
          .querySelector("#journey")
          ?.textContent?.includes("Fugitive is moving"),
    );
  };
  try {
    await page.goto("http://localhost:3000/");
    await waitHome();
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [844, 390],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await geometry(`Home ${width}×${height}`);
      await page.getByRole("button", { name: "▦ Levels", exact: true }).click();
      assert(
        (await page.locator(".level-card").count()) === 15,
        "15 India levels at " + width,
      );
      await geometry("Levels " + width);
      assert(
        (await page.locator(".level-card:disabled").count()) === 14,
        "Only first level is available at " + width,
      );
      await page
        .getByRole("button", { name: "↗ Academy", exact: true })
        .click();
      assert(
        (await page.locator(".squad-card").count()) === 3,
        "Three specialist types at " + width,
      );
      await geometry("Academy " + width);
      await page.getByRole("button", { name: "⌂ Home", exact: true }).click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "output/playwright/progression-home.png" });
    await page
      .getByRole("button", { name: "Play Level 1 →", exact: true })
      .click();
    assert(
      (await page.locator(".deployment-slot.future").count()) === 2,
      "Two future slot placeholders",
    );
    await page.locator('[data-action="remove-slot"][data-slot="2"]').click();
    assert(
      (await page.getByRole("button", { name: /Empty slot 3/ }).count()) === 1,
      "An empty deployment slot is allowed",
    );
    await page.locator('[data-action="add-squad"][data-id="patrol-3"]').click();
    await page
      .getByRole("button", { name: "Start level →", exact: true })
      .click();
    await page.locator(".border-post.guided").waitFor();
    await geometry("Gameplay portrait");
    await page.screenshot({ path: "output/playwright/progression-game.png" });
    await move(1, 1);
    await page.waitForFunction(
      () => document.querySelector("#moves-left")?.textContent === "14",
    );
    await page.reload();
    await page.locator("#moves-left").waitFor();
    assert(
      (await page.locator("#moves-left").textContent()) === "14",
      "Refresh restores the issued move",
    );
    await move(2, 3);
    await page.getByRole("heading", { name: "Case closed." }).waitFor();
    await page.waitForFunction(() =>
      document.querySelector(".reward-display")?.textContent?.includes("90"),
    );
    assert(
      (await page.getByRole("button", { name: "Next level →" }).count()) === 1,
      "First capture opens next level",
    );
    await page.screenshot({ path: "output/playwright/progression-result.png" });
    await page.getByRole("button", { name: "Next level →" }).click();
    await page.getByRole("button", { name: "Start level →" }).click();
    await page.locator('[data-border="0"]').waitFor();
    await move(0, 0);
    await move(1, 2);
    await page.getByRole("heading", { name: "Case closed." }).waitFor();
    await page.waitForFunction(() =>
      document.querySelector(".reward-display")?.textContent?.includes("135"),
    );
    await page
      .getByRole("button", { name: "Training academy", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Recruit · ◈ 25", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Your next move. On any device." })
      .waitFor();
    assert(true, "First purchase triggers optional sign-in before Level 4");
    await page
      .getByRole("button", { name: "Keep playing", exact: true })
      .click();
    assert(
      (await page
        .getByRole("button", { name: "Recruit · ◈ 25", exact: true })
        .count()) === 0,
      "A specialist cannot be purchased twice",
    );
    await page
      .getByRole("button", { name: "Train · ◈ 20", exact: true })
      .click();
    await page.locator("[data-deadline]").waitFor();
    assert(true, "Paid training shows a persistent countdown");
    await page.screenshot({
      path: "output/playwright/progression-academy.png",
    });
    await page.reload();
    await page.locator("[data-deadline]").waitFor();
    assert(true, "Training survives refresh");
    await page.getByRole("button", { name: "▦ Levels", exact: true }).click();
    await page.locator('[data-action="choose"][data-level="3"]').click();
    assert(
      await page
        .locator('[data-action="add-squad"][data-id="rapid"]')
        .isDisabled(),
      "Training squad cannot be selected",
    );
    assert(!errors.length, "No browser page errors");
    return { checks: checks.length, passed: checks, pageErrors: errors };
  } catch (error) {
    await page.screenshot({
      path: "output/playwright/progression-failure.png",
    });
    throw error;
  } finally {
    await context.close();
  }
}
