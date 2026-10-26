async (basePage) => {
  const origin = new URL(basePage.url()).origin,
    results = [];
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [768, 1024],
    [1440, 900],
  ]) {
    const context = await basePage
      .context()
      .browser()
      .newContext({
        viewport: { width, height },
        isMobile: width < 900,
        hasTouch: true,
      });
    const page = await context.newPage();
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
        await page
          .locator(`[data-action="add-squad"][data-id="${id}"]`)
          .click();
      await page.locator('[data-action="start"]').click();
      await page
        .locator('#map[data-basemap="ready"]')
        .waitFor({ timeout: 30000 });
      let overlap = false;
      for (const order of levels[0].witness) {
        await page
          .locator(`[data-action="select-squad"][data-squad="${order.squad}"]`)
          .click();
        await page.locator(`[data-border="${order.border}"]`).click();
        const boxes = await page.evaluate(() => {
          const a = document.querySelector(".coach").getBoundingClientRect(),
            b = document.querySelector(".squad-dock").getBoundingClientRect();
          return {
            overlap:
              a.left < b.right &&
              a.right > b.left &&
              a.top < b.bottom &&
              a.bottom > b.top,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
          };
        });
        if (boxes.overlap || boxes.overflow)
          throw new Error(`${width}x${height}: ` + JSON.stringify(boxes));
        await page.screenshot({
          path: `output/playwright/patrol-next-map-${width}.png`,
        });
        await page.locator('[data-action="deploy"]').click();
        await page.waitForFunction(
          () =>
            document.querySelector(".capture-moment") ||
            document
              .querySelector("#journey")
              ?.textContent?.includes("Time paused"),
        );
      }
      await page.locator("#result-panel.victory:not([hidden])").waitFor();
      await page.waitForFunction(() => {
        const r = document
            .querySelector(".runner-marker.captured")
            .getBoundingClientRect(),
          p = document.querySelector("#result-panel").getBoundingClientRect();
        return !(
          r.left < p.right &&
          r.right > p.left &&
          r.top < p.bottom &&
          r.bottom > p.top
        );
      });
      const home = await page
        .locator('#result-panel [data-action="home"]')
        .boundingBox();
      if (!home || home.y < 0 || home.y + home.height > height)
        throw new Error("Home is clipped at " + width);
      await page.screenshot({
        path: `output/playwright/patrol-next-win-${width}.png`,
      });
      results.push({
        width,
        height,
        guideOverlap: false,
        homeVisible: true,
        captureVisible: true,
      });
    } catch (error) {
      await page.screenshot({
        path: `output/playwright/patrol-next-layout-failure-${width}.png`,
        fullPage: true,
      });
      throw error;
    } finally {
      await context.close();
    }
  }
  return results;
}
