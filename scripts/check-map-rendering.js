async (basePage) => {
  const origin = new URL(basePage.url()).origin,
    report = [];
  for (const fault of ["none", "font", "source"]) {
    const context = await basePage
        .context()
        .browser()
        .newContext({ viewport: { width: 390, height: 844 } }),
      page = await context.newPage();
    const received = [],
      failed = [];
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (u.hostname === "tiles.openfreemap.org")
        received.push({ path: u.pathname, status: r.status() });
    });
    page.on("requestfailed", (r) => {
      const u = new URL(r.url());
      if (u.hostname === "tiles.openfreemap.org") failed.push(u.pathname);
    });
    if (fault === "font")
      await page.route("https://tiles.openfreemap.org/fonts/**", (r) =>
        r.abort(),
      );
    if (fault === "source")
      await page.route("https://tiles.openfreemap.org/planet", (r) =>
        r.abort(),
      );
    try {
      await page.goto(
        origin + (origin.includes("localhost") ? "/?local=1" : "/"),
      );
      await page.locator('[data-action="choose"][data-level="1"]').click();
      for (const id of ["patrol-1", "patrol-2", "patrol-3"])
        await page
          .locator(`[data-action="add-squad"][data-id="${id}"]`)
          .click();
      await page.locator('[data-action="start"]').click();
      await page
        .locator(
          `#map[data-basemap="${fault === "source" ? "fallback" : "ready"}"]`,
        )
        .waitFor({ timeout: 30000 });
      if (fault === "none") {
        await page.waitForFunction(() =>
          document.querySelector('#map[data-basemap="ready"]'),
        );
        await page.screenshot({
          path: "output/playwright/patrol-tactical-basemap.png",
        });
        if (
          !received.some(
            (r) =>
              r.path.endsWith(".pbf") &&
              !r.path.includes("/fonts/") &&
              r.status === 200,
          )
        )
          throw new Error("No successful vector tile");
      }
      const warning = await page.locator("#toast").innerText();
      if (fault === "font" && warning.includes("Map detail"))
        throw new Error(
          "Font failure incorrectly reported a total basemap failure",
        );
      if (fault === "source" && !warning.includes("Map detail is offline"))
        throw new Error("Source failure has no honest fallback status");
      report.push({
        fault,
        status: fault === "source" ? "fallback" : "ready",
        successfulTiles: received.filter(
          (r) =>
            r.path.endsWith(".pbf") &&
            !r.path.includes("/fonts/") &&
            r.status === 200,
        ).length,
        failedResources: failed.length,
      });
    } finally {
      await context.close();
    }
  }
  return report;
}
