// Development fixture checks for unfinished saves made before mandatory guides.
async (basePage) => {
  const origin = new URL(basePage.url()).origin,
    results = [];
  if (!origin.includes("localhost"))
    throw new Error("Legacy fixtures are development-only");
  for (const level of [1, 3]) {
    const context = await basePage
        .context()
        .browser()
        .newContext({ viewport: { width: 390, height: 844 } }),
      page = await context.newPage();
    try {
      await page.goto(origin + "/?local=1");
      await page.locator('[data-action="choose"]').first().waitFor();
      await page.evaluate(async (level) => {
        const { initialProgress, advanceProgress } = await import(
          "/src/game/player-progress.ts"
        );
        const { awardWin, applyAction } = await import(
          "/src/game/collection.ts"
        );
        const { Navigation } = await import("/src/game/navigation.ts");
        const board = await (await fetch("/data/india.json")).json(),
          levels = (await (await fetch("/data/india-campaign.json")).json())
            .levels;
        let state = initialProgress();
        state.player.tutorials = { field: true, academy: true };
        if (level === 3) {
          state.player = awardWin(state.player, 1, 15).player;
          state.player = awardWin(state.player, 2, 15).player;
          state.player = applyAction(
            state.player,
            { kind: "purchase", squad: "rapid" },
            Date.now(),
          );
          state.player.loginPrompted = true;
        }
        state = advanceProgress(
          state,
          {
            actionId: crypto.randomUUID(),
            revision: state.player.revision,
            op: "start",
            level,
            selection:
              level === 1
                ? ["patrol-1", null, null]
                : ["patrol-1", "rapid", "patrol-3"],
          },
          board,
          levels,
          Date.now(),
          new Navigation(board),
        );
        localStorage.setItem(
          "patrol:progress:v2",
          JSON.stringify({ uid: "local", progress: state }),
        );
        localStorage.removeItem("patrol:outbox:v1");
      }, level);
      await page.goto(origin + "/?local=1#play");
      await page.reload();
      await page.locator(".coach").waitFor();
      if (await page.locator(".game-page").count())
        throw new Error("An old Skip state bypassed mandatory training");
      if (
        !(await page.evaluate(
          () => !!localStorage.getItem("patrol:pre-tutorial-attempt:v2"),
        ))
      )
        throw new Error("Old attempt was not backed up");
      if (level === 3) {
        await page.locator('.coach-target[data-action="academy"]').click();
        await page.locator('[data-action="train"][data-id="rapid"]').click();
        await page.locator('[data-training="rapid"]').waitFor();
      }
      results.push({
        level,
        oldSkipCannotBypass: true,
        attemptBackedUp: true,
        trainingUnblocked: true,
      });
    } finally {
      await context.close();
    }
  }
  return results;
}
